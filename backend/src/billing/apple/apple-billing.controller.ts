import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';

import { AuthenticatedUser, CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AppleBillingService } from './apple-billing.service';
import { RestoreAppleReceiptDto } from './dto/restore-apple-receipt.dto';
import { VerifyAppleReceiptDto } from './dto/verify-apple-receipt.dto';

// First-party endpoints the mobile client posts to. Both require the
// signed-in user — every Apple transaction is bound to a specific account on
// our side, so a JWT is required to know which Subscription row to upsert.
//
// /webhooks/apple is intentionally *not* on this controller; it has its own
// no-auth endpoint because Apple's servers don't ship a bearer token.
@UseGuards(JwtAuthGuard)
@Controller('billing/apple')
export class AppleBillingController {
  constructor(private readonly apple: AppleBillingService) {}

  // Called immediately after expo-iap's requestPurchase resolves. The mobile
  // SDK gives us the JWS for the transaction it just bought; we verify
  // signature + bundle + plan and persist the Subscription row.
  @Post('verify')
  @HttpCode(200)
  verify(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyAppleReceiptDto) {
    return this.apple.verifyAndUpsert(user.id, dto.planCode, dto.jwsRepresentation);
  }

  // Called by the "Restore Purchases" button. Required by App Review even
  // though our backend is the source of truth — the JWS the device hands us
  // is the latest one for an existing originalTransactionId, so this lets a
  // user on a new device reattach to their server-side sub without a fresh
  // charge.
  @Post('restore')
  @HttpCode(200)
  restore(@CurrentUser() user: AuthenticatedUser, @Body() dto: RestoreAppleReceiptDto) {
    return this.apple.verifyAndUpsert(user.id, dto.planCode, dto.jwsRepresentation);
  }
}
