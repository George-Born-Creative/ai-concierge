import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';

import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BillingService } from './billing.service';
import { CreatePaymentSheetDto } from './dto/create-payment-sheet.dto';

@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post('payment-sheet')
  @HttpCode(200)
  createPaymentSheet(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePaymentSheetDto) {
    return this.billing.createPaymentSheet(user.id, dto.planCode);
  }

  @Post('subscription/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.cancelActiveSubscription(user.id);
  }

  // Pulls the latest status from Stripe and updates the local row. Mobile
  // calls this right after PaymentSheet success so the user doesn't have to
  // wait on the webhook (which isn't wired in local dev).
  @Post('subscription/refresh')
  @HttpCode(200)
  refresh(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.syncSubscriptionFromStripe(user.id);
  }
}
