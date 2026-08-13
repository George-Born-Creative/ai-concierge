import { Module } from '@nestjs/common';

import { PlansModule } from '../plans/plans.module';
import { AppleBillingConfig } from './apple/apple-billing.config';
import { AppleBillingController } from './apple/apple-billing.controller';
import { AppleBillingService } from './apple/apple-billing.service';
import { AppleWebhookController } from './apple/apple-webhook.controller';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeProvider } from './stripe.provider';
import { StripeWebhookController } from './stripe.webhook.controller';

@Module({
  imports: [PlansModule],
  controllers: [
    BillingController,
    StripeWebhookController,
    AppleBillingController,
    AppleWebhookController,
  ],
  providers: [BillingService, StripeProvider, AppleBillingConfig, AppleBillingService],
  exports: [BillingService, StripeProvider, AppleBillingService],
})
export class BillingModule {}
