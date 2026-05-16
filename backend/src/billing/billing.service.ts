import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Plan, SubscriptionStatus } from '@prisma/client';
import Stripe from 'stripe';

import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { STRIPE_API_VERSION, StripeProvider } from './stripe.provider';

type PaymentSheetParams = {
  paymentIntent: string;
  ephemeralKey: string;
  customer: string;
  publishableKey: string;
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly stripeProvider: StripeProvider,
  ) {}

  // Creates a Stripe subscription in `incomplete` state and returns the
  // PaymentSheet parameters the mobile SDK needs to collect a payment method.
  //
  // One subscription per user (enforced by Subscription.userId @unique):
  //   - already ACTIVE/TRIALING on the same plan → reject (no double-charge)
  //   - already ACTIVE/TRIALING on a different plan → cancel it, disable the
  //     linked CRM integration, then create the new one (CRM switch)
  //   - any other lingering sub (INCOMPLETE/PAST_DUE/etc) → cancel before
  //     creating a fresh one so we never leave orphans in Stripe
  async createPaymentSheet(userId: string, planCode: string): Promise<PaymentSheetParams> {
    const plan = await this.plans.findByCode(planCode);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: { include: { plan: true } } },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const stripe = this.stripeProvider.client;
    const customerId = await this.ensureStripeCustomer(stripe, userId, user.email, user.stripeCustomerId);

    if (user.subscription) {
      const samePlan = user.subscription.planId === plan.id;
      const active = isActive(user.subscription.status);

      if (samePlan && active) {
        throw new BadRequestException('You already have this plan active.');
      }

      await this.cancelStripeSubscription(stripe, user.subscription.stripeSubscriptionId);

      if (!samePlan) {
        await this.disableIntegrationsForUser(userId);
      }
    }

    const stripeSub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: plan.stripePriceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: { userId, planCode: plan.code },
    });

    const paymentIntent = this.extractPaymentIntent(stripeSub);
    if (!paymentIntent?.client_secret) {
      throw new BadRequestException('Stripe did not return a PaymentIntent client secret');
    }

    await this.upsertSubscriptionRecord(userId, plan, stripeSub);

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: STRIPE_API_VERSION },
    );

    return {
      paymentIntent: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret ?? '',
      customer: customerId,
      publishableKey: this.stripeProvider.publishableKey,
    };
  }

  async cancelActiveSubscription(userId: string): Promise<{ canceled: boolean }> {
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!sub || !sub.stripeSubscriptionId) {
      return { canceled: false };
    }
    await this.cancelStripeSubscription(this.stripeProvider.client, sub.stripeSubscriptionId);
    await this.prisma.subscription.update({
      where: { userId },
      data: { status: SubscriptionStatus.CANCELED },
    });
    await this.disableIntegrationsForUser(userId);
    return { canceled: true };
  }

  // ── Webhook handlers ────────────────────────────────────────────────────────

  async handleSubscriptionEvent(stripeSub: Stripe.Subscription) {
    const userId = stripeSub.metadata?.userId;
    if (!userId) {
      this.logger.warn(`Stripe subscription ${stripeSub.id} missing userId metadata`);
      return;
    }

    const plan = await this.prisma.plan.findUnique({ where: { stripePriceId: stripeSub.items.data[0]?.price.id } });
    if (!plan) {
      this.logger.warn(`No local plan found for price ${stripeSub.items.data[0]?.price.id}`);
      return;
    }

    const status = mapStripeStatus(stripeSub.status);
    await this.prisma.subscription.upsert({
      where: { userId },
      update: {
        planId: plan.id,
        stripeSubscriptionId: stripeSub.id,
        status,
        currentPeriodEnd: stripeSub.current_period_end
          ? new Date(stripeSub.current_period_end * 1000)
          : null,
      },
      create: {
        userId,
        planId: plan.id,
        stripeSubscriptionId: stripeSub.id,
        status,
        currentPeriodEnd: stripeSub.current_period_end
          ? new Date(stripeSub.current_period_end * 1000)
          : null,
      },
    });

    if (!isActive(status)) {
      await this.disableIntegrationsForUser(userId);
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async ensureStripeCustomer(
    stripe: Stripe,
    userId: string,
    email: string,
    existingCustomerId: string | null,
  ): Promise<string> {
    if (existingCustomerId) {
      return existingCustomerId;
    }
    const customer = await stripe.customers.create({
      email,
      metadata: { userId },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customer.id },
    });
    return customer.id;
  }

  private async cancelStripeSubscription(stripe: Stripe, subscriptionId: string | null) {
    if (!subscriptionId) return;
    try {
      await stripe.subscriptions.cancel(subscriptionId);
    } catch (err) {
      this.logger.warn(`Failed to cancel Stripe subscription ${subscriptionId}: ${(err as Error).message}`);
    }
  }

  private async disableIntegrationsForUser(userId: string) {
    await this.prisma.integrationConnection.updateMany({
      where: { userId, enabled: true },
      data: { enabled: false },
    });
  }

  private async upsertSubscriptionRecord(
    userId: string,
    plan: Plan,
    stripeSub: Stripe.Subscription,
  ) {
    const status = mapStripeStatus(stripeSub.status);
    await this.prisma.subscription.upsert({
      where: { userId },
      update: {
        planId: plan.id,
        stripeSubscriptionId: stripeSub.id,
        status,
      },
      create: {
        userId,
        planId: plan.id,
        stripeSubscriptionId: stripeSub.id,
        status,
      },
    });
  }

  private extractPaymentIntent(sub: Stripe.Subscription): Stripe.PaymentIntent | null {
    const invoice = sub.latest_invoice;
    if (!invoice || typeof invoice === 'string') return null;
    const pi = invoice.payment_intent;
    if (!pi || typeof pi === 'string') return null;
    return pi;
  }
}

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case 'active':
      return SubscriptionStatus.ACTIVE;
    case 'trialing':
      return SubscriptionStatus.TRIALING;
    case 'past_due':
      return SubscriptionStatus.PAST_DUE;
    case 'canceled':
      return SubscriptionStatus.CANCELED;
    case 'unpaid':
      return SubscriptionStatus.UNPAID;
    case 'incomplete':
    case 'incomplete_expired':
    default:
      return SubscriptionStatus.INCOMPLETE;
  }
}

function isActive(status: SubscriptionStatus): boolean {
  return status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.TRIALING;
}
