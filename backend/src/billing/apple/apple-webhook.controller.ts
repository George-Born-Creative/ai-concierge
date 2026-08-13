import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { AppleBillingService } from './apple-billing.service';
import { AppleNotificationDto } from './dto/apple-notification.dto';

// App Store Server Notifications V2 endpoint. Unauthenticated — Apple's
// servers don't supply a bearer — but every request is JWS-signed and the
// SignedDataVerifier rejects anything that doesn't chain to Apple's roots
// for our bundle in our environment. That's the security boundary, not the
// network ACL.
//
// We register the URL in App Store Connect and point both Sandbox and
// Production environments at it. Apple retries 5xx responses for ~3 days,
// so anything we can't immediately make sense of (unknown transaction,
// missing data field) is logged and 2xx'd to drop out of the retry loop.
@Controller('webhooks/apple')
export class AppleWebhookController {
  constructor(private readonly apple: AppleBillingService) {}

  @Post()
  @HttpCode(200)
  handle(@Body() dto: AppleNotificationDto) {
    return this.apple.handleNotification(dto.signedPayload);
  }
}
