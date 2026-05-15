import { Module } from '@nestjs/common';

import { PlansModule } from '../plans/plans.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeProvider } from './stripe.provider';
import { StripeWebhookController } from './stripe.webhook.controller';

@Module({
  imports: [PlansModule],
  controllers: [BillingController, StripeWebhookController],
  providers: [BillingService, StripeProvider],
  exports: [BillingService, StripeProvider],
})
export class BillingModule {}
