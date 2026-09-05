import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
 RawBodyRequest } from '@nestjs/common';

import { Request } from 'express';
import Stripe from 'stripe';

import { BillingService } from './billing.service';
import { StripeProvider } from './stripe.provider';

@Controller('webhooks/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly billing: BillingService,
    private readonly stripeProvider: StripeProvider,
  ) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }
    if (!req.rawBody) {
      throw new BadRequestException('Raw body is required for Stripe webhooks');
    }

    let event: Stripe.Event;
    try {
      event = this.stripeProvider.client.webhooks.constructEvent(
        req.rawBody,
        signature,
        this.stripeProvider.webhookSecret,
      );
    } catch (err) {
      this.logger.warn(`Invalid Stripe signature: ${(err as Error).message}`);
      throw new BadRequestException('Invalid Stripe signature');
    }

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.billing.handleSubscriptionEvent(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = stripeInvoiceSubscriptionId(invoice);
        if (subId) {
          const sub = await this.stripeProvider.client.subscriptions.retrieve(subId);
          await this.billing.handleSubscriptionEvent(sub);
        }
        break;
      }
      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }

    return { received: true };
  }
}

// Invoice.subscription was removed in Stripe's 2025 Basil API in favor of
// parent.subscription_details.subscription. Support both so payment events
// still persist current_period_end.
function stripeInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const direct = (invoice as Stripe.Invoice & { subscription?: string | { id?: string } | null })
    .subscription;
  if (typeof direct === 'string') return direct;
  if (direct && typeof direct === 'object' && typeof direct.id === 'string') {
    return direct.id;
  }
  const nested = (
    invoice as Stripe.Invoice & {
      parent?: { subscription_details?: { subscription?: string | { id?: string } | null } };
    }
  ).parent?.subscription_details?.subscription;
  if (typeof nested === 'string') return nested;
  if (nested && typeof nested === 'object' && typeof nested.id === 'string') {
    return nested.id;
  }
  return null;
}
