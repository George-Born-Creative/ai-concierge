import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CrmProvider, PaymentProvider, Plan, Subscription, SubscriptionStatus } from '@prisma/client';
import Stripe from 'stripe';

import {
  fallbackActiveCrmProvider,
  isActiveSubscriptionStatus,
  setActiveCrmProviderIfNull,
} from '../common/crm-account';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { STRIPE_API_VERSION, StripeProvider } from './stripe.provider';

// Returned by cancelActiveSubscription. For Stripe subs we actually cancel and
// flip the row to CANCELED. For Apple subs we can't cancel server-side (App
// Store owns the lifecycle) so we send the mobile app a deep link to the iOS
// subscriptions page instead.
type CancelSubscriptionResult = {
  canceled: boolean;
  manageUrl?: string;
};

type PaymentSheetParams = {
  paymentIntent: string;
  ephemeralKey: string;
  customer: string;
  publishableKey: string;
};

type SubscriptionWithPlan = Subscription & { plan: Plan };

// Stripe moved current_period_end off Subscription onto SubscriptionItem in
// 2025 API versions (Basil+). Webhook payloads use the Dashboard endpoint's
// API version, which may not match STRIPE_API_VERSION, so we read both.
type StripePeriodFields = {
  current_period_end?: number | null;
  items?: { data?: Array<{ current_period_end?: number | null }> };
};

export function stripeCurrentPeriodEnd(sub: object): Date | null {
  const rec = sub as StripePeriodFields;
  const fromSub =
    typeof rec.current_period_end === 'number' && rec.current_period_end > 0
      ? rec.current_period_end
      : null;
  const fromItem =
    typeof rec.items?.data?.[0]?.current_period_end === 'number' &&
    rec.items.data[0].current_period_end > 0
      ? rec.items.data[0].current_period_end
      : null;
  const unix = fromSub ?? fromItem;
  return unix ? new Date(unix * 1000) : null;
}

// Surfaced to the mobile app when it tries to cancel an Apple sub. Apple
// universal link — iOS routes it straight to the Manage Subscriptions sheet,
// no Safari hop.
const APPLE_MANAGE_SUBSCRIPTIONS_URL = 'itms-apps://apps.apple.com/account/subscriptions';

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
  // One subscription per (user, plan) — a user may hold ghl-pro and hubspot-pro:
  //   - already ACTIVE/TRIALING on this plan → reject (no double-charge)
  //   - lingering INCOMPLETE/PAST_DUE on this plan → cancel that Stripe sub only
  //   - an active subscription on the *other* CRM plan is left untouched
  async createPaymentSheet(userId: string, planCode: string): Promise<PaymentSheetParams> {
    const plan = await this.plans.findByCode(planCode);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscriptions: { include: { plan: true } } },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const stripe = this.stripeProvider.client;
    const customerId = await this.ensureStripeCustomer(stripe, userId, user.email, user.stripeCustomerId);

    const existingForPlan = user.subscriptions.find((sub) => sub.planId === plan.id);
    if (existingForPlan && isActiveSubscriptionStatus(existingForPlan.status)) {
      throw new BadRequestException('You already have this plan active.');
    }
    if (existingForPlan?.stripeSubscriptionId) {
      await this.cancelStripeSubscription(stripe, existingForPlan.stripeSubscriptionId);
    }

    const stripeSub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: plan.stripePriceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        payment_method_types: ['card'],
        save_default_payment_method: 'on_subscription',
      },
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

  // Pulls the live status of the user's Stripe subscription(s) and reconciles
  // the local rows. Lets the mobile app force a row out of INCOMPLETE right
  // after PaymentSheet succeeds, even when Stripe webhooks aren't wired in
  // local dev (whsec_replace_me).
  async syncSubscriptionFromStripe(userId: string): Promise<{ status: SubscriptionStatus }> {
    const subs = await this.prisma.subscription.findMany({
      where: { userId, stripeSubscriptionId: { not: null } },
      orderBy: { updatedAt: 'desc' },
    });
    if (subs.length === 0) {
      throw new NotFoundException('No Stripe subscription to refresh');
    }

    let lastStatus: SubscriptionStatus = SubscriptionStatus.INCOMPLETE;
    for (const sub of subs) {
      const stripeSub = await this.stripeProvider.client.subscriptions.retrieve(
        sub.stripeSubscriptionId!,
        { expand: ['latest_invoice.payment_intent'] },
      );
      if (!stripeSub.metadata?.userId) {
        await this.stripeProvider.client.subscriptions.update(stripeSub.id, {
          metadata: { ...stripeSub.metadata, userId },
        });
        stripeSub.metadata = { ...stripeSub.metadata, userId };
      }
      await this.handleSubscriptionEvent(stripeSub);
      lastStatus = mapStripeStatus(stripeSub.status);
    }
    return { status: lastStatus };
  }

  // Stripe subs cancel here; Apple subs return a deep link instead because
  // App Store owns the lifecycle. We can flip the local row eagerly for
  // Stripe (the webhook will reconcile anyway) but never for Apple — Apple
  // will only release the entitlement at the end of the billing period and
  // its EXPIRED notification is what actually transitions the row.
  //
  // With two CRM plans, cancel targets the active CRM's Stripe sub. Apple
  // still returns the manage URL (App Store owns both products).
  async cancelActiveSubscription(userId: string): Promise<CancelSubscriptionResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscriptions: { include: { plan: true } } },
    });
    const target = pickSubscriptionToCancel(user?.subscriptions ?? [], user?.activeCrmProvider ?? null);
    if (!target) {
      return { canceled: false };
    }

    if (target.paymentProvider === PaymentProvider.APPLE) {
      return { canceled: false, manageUrl: APPLE_MANAGE_SUBSCRIPTIONS_URL };
    }

    if (!target.stripeSubscriptionId) {
      return { canceled: false };
    }

    await this.cancelStripeSubscription(this.stripeProvider.client, target.stripeSubscriptionId);
    await this.prisma.subscription.update({
      where: { id: target.id },
      data: { status: SubscriptionStatus.CANCELED },
    });
    await this.disableIntegrationsForUser(userId, target.plan.provider);
    return { canceled: true };
  }

  // Same CRM, Stripe → Apple: cancel only that plan's Stripe sub. Does not
  // disable the CRM connection and does not touch the other CRM's plan.
  async cancelStripeSubscriptionForPlan(subscription: Subscription): Promise<void> {
    await this.cancelStripeSubscription(
      this.stripeProvider.client,
      subscription.stripeSubscriptionId,
    );
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
    const currentPeriodEnd = stripeCurrentPeriodEnd(stripeSub);
    await this.prisma.subscription.upsert({
      where: { userId_planId: { userId, planId: plan.id } },
      update: {
        stripeSubscriptionId: stripeSub.id,
        paymentProvider: PaymentProvider.STRIPE,
        status,
        // Leave the stored date alone when Stripe omits the field (newer API
        // versions / incomplete payloads). Writing null here is why Profile
        // showed "Not available".
        ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
      },
      create: {
        userId,
        planId: plan.id,
        stripeSubscriptionId: stripeSub.id,
        paymentProvider: PaymentProvider.STRIPE,
        status,
        currentPeriodEnd,
      },
    });

    if (isActiveSubscriptionStatus(status)) {
      await setActiveCrmProviderIfNull(this.prisma, userId, plan.provider);
    } else {
      await this.disableIntegrationsForUser(userId, plan.provider);
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

  // Exposed so AppleBillingService can call it from REFUND / REVOKE / EXPIRED.
  // Only the lapsed CRM is disconnected; the other plan stays up.
  async disableIntegrationsForUser(userId: string, provider: CrmProvider) {
    await this.prisma.integrationConnection.updateMany({
      where: { userId, provider, enabled: true },
      data: { enabled: false },
    });
    await fallbackActiveCrmProvider(this.prisma, userId);
  }

  // Existing paid rows often have currentPeriodEnd=null because checkout never
  // stored it. Pull the date from Stripe once so GET /auth/me can return it.
  async hydrateMissingPeriodEnds(userId: string): Promise<void> {
    const rows = await this.prisma.subscription.findMany({
      where: {
        userId,
        currentPeriodEnd: null,
        stripeSubscriptionId: { not: null },
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
        },
      },
      select: { id: true, stripeSubscriptionId: true },
    });
    if (rows.length === 0) return;

    for (const row of rows) {
      try {
        const stripeSub = await this.stripeProvider.client.subscriptions.retrieve(
          row.stripeSubscriptionId!,
        );
        const currentPeriodEnd = stripeCurrentPeriodEnd(stripeSub);
        if (!currentPeriodEnd) continue;
        await this.prisma.subscription.update({
          where: { id: row.id },
          data: { currentPeriodEnd },
        });
      } catch (err) {
        this.logger.warn(
          `Could not hydrate period end for ${row.stripeSubscriptionId}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async upsertSubscriptionRecord(
    userId: string,
    plan: Plan,
    stripeSub: Stripe.Subscription,
  ) {
    const status = mapStripeStatus(stripeSub.status);
    const currentPeriodEnd = stripeCurrentPeriodEnd(stripeSub);
    await this.prisma.subscription.upsert({
      where: { userId_planId: { userId, planId: plan.id } },
      update: {
        stripeSubscriptionId: stripeSub.id,
        paymentProvider: PaymentProvider.STRIPE,
        status,
        ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
      },
      create: {
        userId,
        planId: plan.id,
        stripeSubscriptionId: stripeSub.id,
        paymentProvider: PaymentProvider.STRIPE,
        status,
        currentPeriodEnd,
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

function pickSubscriptionToCancel(
  subscriptions: SubscriptionWithPlan[],
  activeCrmProvider: CrmProvider | null,
): SubscriptionWithPlan | undefined {
  if (activeCrmProvider) {
    const match = subscriptions.find((sub) => sub.plan.provider === activeCrmProvider);
    if (match) return match;
  }
  return (
    subscriptions.find((sub) => isActiveSubscriptionStatus(sub.status)) ??
    subscriptions[0]
  );
}
