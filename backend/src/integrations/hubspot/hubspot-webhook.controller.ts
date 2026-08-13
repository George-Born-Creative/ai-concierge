import { createHash, createHmac, timingSafeEqual } from 'crypto';

import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
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

// Maps a HubSpot subscription type prefix (the part before the first dot, e.g.
// "contact.creation" -> "contact") to the browse-list object key the frontend
// uses (components/hubspot/hubspot-data-screen-content.tsx).
const OBJECT_BY_PREFIX: Record<string, string> = {
  contact: 'contacts',
  deal: 'deals',
  company: 'companies',
  ticket: 'tickets',
  product: 'products',
  order: 'orders',
  line_item: 'orders',
};

// Reject webhooks whose signed timestamp is older than this (replay guard).
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

type HubspotEvent = {
  subscriptionType?: string;
  portalId?: number | string;
};

/**
 * Inbound HubSpot webhooks. When a record changes in HubSpot (via their UI,
 * automations, or a teammate), HubSpot POSTs here; we verify the signature,
 * map the affected portal to our user(s), and push `crm.invalidate` so any
 * open browse list refreshes the affected object live.
 *
 * Register the webhook URL (POST /webhooks/hubspot) and the object
 * subscriptions in the HubSpot app settings.
 */
@Controller('webhooks/hubspot')
export class HubspotWebhookController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hubspot-signature-v3') signatureV3: string | undefined,
    @Headers('x-hubspot-signature') signatureV1: string | undefined,
    @Headers('x-hubspot-request-timestamp') timestamp: string | undefined,
  ): Promise<{ received: true }> {
    const raw = req.rawBody;
    if (!raw) {
      throw new BadRequestException('Raw body is required for HubSpot webhooks');
    }

    this.verifySignature(req, raw, signatureV3, signatureV1, timestamp);

    let events: HubspotEvent[];
    try {
      const parsed = JSON.parse(raw.toString('utf8')) as unknown;
      events = Array.isArray(parsed) ? (parsed as HubspotEvent[]) : [parsed as HubspotEvent];
    } catch {
      throw new BadRequestException('Invalid HubSpot webhook payload');
    }

    // Group affected object keys per portal so we emit once per (user, object).
    const objectsByPortal = new Map<string, Set<string>>();
    for (const event of events) {
      const portalId = event.portalId != null ? String(event.portalId) : undefined;
      const prefix = event.subscriptionType?.split('.')[0];
      const object = prefix ? OBJECT_BY_PREFIX[prefix] : undefined;
      if (!portalId || !object) continue;
      const set = objectsByPortal.get(portalId) ?? new Set<string>();
      set.add(object);
      objectsByPortal.set(portalId, set);
    }

    for (const [portalId, objects] of objectsByPortal) {
      const connections = await this.prisma.integrationConnection.findMany({
        where: { provider: CrmProvider.HUBSPOT, portalId, enabled: true },
        select: { userId: true },
      });
      for (const { userId } of connections) {
        for (const object of objects) {
          this.realtime.emitToUser(userId, 'crm.invalidate', {
            provider: 'hubspot',
            object,
          });
        }
      }
    }

    return { received: true };
  }

  /**
   * Verify the request came from HubSpot. Prefers the v3 HMAC (over
   * method+uri+body+timestamp), falling back to the legacy v1 hash
   * (sha256 of clientSecret+body). Both use the app client secret.
   */
  private verifySignature(
    req: Request,
    raw: Buffer,
    signatureV3: string | undefined,
    signatureV1: string | undefined,
    timestamp: string | undefined,
  ): void {
    const clientSecret = this.config.get<string>('HUBSPOT_CLIENT_SECRET');
    if (!clientSecret) {
      throw new UnauthorizedException('HubSpot webhook secret is not configured');
    }

    if (signatureV3) {
      if (!timestamp) {
        throw new UnauthorizedException('Missing HubSpot request timestamp');
      }
      const age = Date.now() - Number(timestamp);
      if (!Number.isFinite(age) || age > MAX_TIMESTAMP_AGE_MS) {
        throw new UnauthorizedException('Stale HubSpot webhook timestamp');
      }
      const uri = this.signedUri(req);
      const base = `POST${uri}${raw.toString('utf8')}${timestamp}`;
      const expected = createHmac('sha256', clientSecret)
        .update(base)
        .digest('base64');
      if (!this.safeEqual(expected, signatureV3)) {
        throw new UnauthorizedException('Invalid HubSpot signature');
      }
      return;
    }

    if (signatureV1) {
      const expected = createHash('sha256')
        .update(clientSecret + raw.toString('utf8'))
        .digest('hex');
      if (!this.safeEqual(expected, signatureV1)) {
        throw new UnauthorizedException('Invalid HubSpot signature');
      }
      return;
    }

    throw new UnauthorizedException('Missing HubSpot signature');
  }

  // HubSpot signs the exact public URL it called. Behind nginx we reconstruct
  // it from the forwarded proto/host; an explicit HUBSPOT_WEBHOOK_URL overrides
  // this when the reconstruction can't match (e.g. path rewrites).
  private signedUri(req: Request): string {
    const override = this.config.get<string>('HUBSPOT_WEBHOOK_URL');
    if (override) return override;
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
    return `${proto}://${host}${req.originalUrl}`;
  }

  private safeEqual(expected: string, provided: string): boolean {
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
