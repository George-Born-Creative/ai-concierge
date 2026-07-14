import { createVerify } from 'crypto';

import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CrmProvider } from '@prisma/client';
import type { Request } from 'express';

import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';

type GhlEvent = {
  type?: string;
  locationId?: string;
};

/**
 * Inbound GoHighLevel webhooks. When a record changes in GHL (via their UI,
 * automations, or a teammate), GHL POSTs here; we verify the RSA signature,
 * map the affected location to our user(s), and push `crm.invalidate` (and,
 * for appointment events, `reminder.changed`) so open screens refresh live.
 *
 * Register the webhook URL (POST /webhooks/ghl) in the GHL marketplace app and
 * set GHL_WEBHOOK_PUBLIC_KEY to GHL's published webhook public key (PEM).
 */
@Controller('webhooks/ghl')
export class GhlWebhookController {
  private readonly logger = new Logger(GhlWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-wh-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    const raw = req.rawBody;
    if (!raw) {
      throw new BadRequestException('Raw body is required for GHL webhooks');
    }

    this.verifySignature(raw, signature);

    let event: GhlEvent;
    try {
      event = JSON.parse(raw.toString('utf8')) as GhlEvent;
    } catch {
      throw new BadRequestException('Invalid GHL webhook payload');
    }

    const locationId = event.locationId;
    const object = this.objectForType(event.type);
    if (!locationId || !object) return { received: true };

    const connections = await this.prisma.integrationConnection.findMany({
      where: { provider: CrmProvider.GHL, locationId, enabled: true },
      select: { userId: true },
    });

    // Appointment changes also affect the reminders screen (appointments are
    // surfaced there), so nudge it to refetch alongside the browse list.
    const isAppointment = /^appointment/i.test(event.type ?? '');
    for (const { userId } of connections) {
      this.realtime.emitToUser(userId, 'crm.invalidate', {
        provider: 'ghl',
        object,
      });
      if (isAppointment) {
        this.realtime.emitToUser(userId, 'reminder.changed', {
          action: 'appointment-webhook',
        });
      }
    }

    return { received: true };
  }

  // Map a GHL event type (e.g. "ContactCreate", "OpportunityUpdate",
  // "AppointmentDelete") to the frontend browse-list object key
  // (components/ghl/ghl-data-screen-content.tsx).
  private objectForType(type: string | undefined): string | undefined {
    if (!type) return undefined;
    if (/^contact/i.test(type)) return 'contacts';
    if (/^opportunity/i.test(type)) return 'opportunities';
    if (/^(appointment|calendar)/i.test(type)) return 'calendar';
    return undefined;
  }

  /**
   * Verify the RSA-SHA256 signature GHL sends in `x-wh-signature` against the
   * published GHL webhook public key. When the key isn't configured we accept
   * the request (so it works out of the box in dev) but warn — a forged
   * webhook can at worst trigger an extra list refresh, never data exposure.
   * Configure GHL_WEBHOOK_PUBLIC_KEY in production.
   */
  private verifySignature(raw: Buffer, signature: string | undefined): void {
    const publicKey = this.config.get<string>('GHL_WEBHOOK_PUBLIC_KEY');
    if (!publicKey) {
      this.logger.warn(
        'GHL_WEBHOOK_PUBLIC_KEY not set — skipping GHL webhook signature verification',
      );
      return;
    }
    if (!signature) {
      throw new UnauthorizedException('Missing GHL signature');
    }
    // The key may be provided with literal "\n" escapes in the env var.
    const pem = publicKey.includes('\\n')
      ? publicKey.replace(/\\n/g, '\n')
      : publicKey;
    const verifier = createVerify('SHA256');
    verifier.update(raw);
    verifier.end();
    let ok = false;
    try {
      ok = verifier.verify(pem, signature, 'base64');
    } catch (err) {
      this.logger.warn(`GHL signature verify error: ${(err as Error).message}`);
      ok = false;
    }
    if (!ok) {
      throw new UnauthorizedException('Invalid GHL signature');
    }
  }
}
