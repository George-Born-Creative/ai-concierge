import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CrmProvider } from '@prisma/client';
import { randomBytes } from 'crypto';

import { decryptSecret, encryptSecret } from '../../common/crypto';
import { PrismaService } from '../../prisma/prisma.service';

const OAUTH_AUTHORIZE_URL = 'https://app.hubspot.com/oauth/authorize';
const OAUTH_TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token';
// Used right after token exchange to discover which HubSpot portal (`hub_id`)
// the access token belongs to. HubSpot doesn't return that in the token
// response itself.
const OAUTH_INTROSPECT_URL = 'https://api.hubapi.com/oauth/v1/access-tokens';
const DEFAULT_SCOPES =
  'crm.objects.contacts.read crm.objects.contacts.write crm.objects.deals.read crm.objects.deals.write crm.objects.companies.read crm.objects.companies.write oauth';
const STATE_PURPOSE = 'hubspot-oauth-state';
const STATE_TTL = '10m';
// Refresh ~60s before actual expiry so in-flight calls never get a 401.
const REFRESH_LEEWAY_MS = 60 * 1000;

type HubspotTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
};

type HubspotIntrospectResponse = {
  token: string;
  user: string;
  hub_domain: string;
  scopes: string[];
  scope_to_scope_group_pks: number[];
  trial_scopes: string[];
  trial_scope_to_scope_group_pks: number[];
  hub_id: number;
  app_id: number;
  expires_in: number;
  user_id: number;
  token_type: string;
};

type StatePayload = {
  sub: string;
  purpose: typeof STATE_PURPOSE;
  nonce: string;
  /**
   * Optional deep link the mobile app expects the OAuth flow to return to.
   * Carried through state so we can support both `aiconcierge://` (dev/prod
   * client) and `exp://...` (Expo Go) without baking the URL into config.
   */
  returnUrl?: string;
};

export type HubspotStatus = {
  connected: boolean;
  portalId?: string | null;
  expiresAt?: string | null;
  scopes?: string[];
};

@Injectable()
export class HubspotService {
  private readonly logger = new Logger(HubspotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  // ── OAuth: build the authorize URL the mobile app opens in a browser ────────

  buildAuthUrl(userId: string, returnUrl?: string): { url: string; state: string } {
    const clientId = this.requireConfig('HUBSPOT_CLIENT_ID');
    const redirectUri = this.requireConfig('HUBSPOT_REDIRECT_URI');
    const scopes = this.config.get<string>('HUBSPOT_SCOPES') || DEFAULT_SCOPES;

    const state = this.jwt.sign(
      {
        sub: userId,
        purpose: STATE_PURPOSE,
        nonce: randomBytes(8).toString('hex'),
        returnUrl: returnUrl ? this.validateReturnUrl(returnUrl) : undefined,
      } satisfies StatePayload,
      { expiresIn: STATE_TTL },
    );

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state,
    });

    return { url: `${OAUTH_AUTHORIZE_URL}?${params.toString()}`, state };
  }

  /**
   * Decode the `returnUrl` baked into a state JWT. Used by the public callback
   * route, which has no JwtAuthGuard, so it can route the redirect back to the
   * app even when the state is later rejected as expired during exchange.
   */
  resolveReturnUrl(state: string): string {
    try {
      const payload = this.jwt.verify<StatePayload>(state);
      if (payload.returnUrl) return payload.returnUrl;
    } catch {
      // Fall through to the default scheme link.
    }
    return `${this.getDeepLinkScheme()}://oauth/hubspot`;
  }

  // ── OAuth: exchange code → tokens, introspect for portal id, persist ────────

  async handleCallback(
    code: string,
    state: string,
  ): Promise<{ userId: string; returnUrl: string }> {
    let payload: StatePayload;
    try {
      payload = this.jwt.verify<StatePayload>(state);
    } catch (err) {
      this.logger.warn(`Invalid HubSpot OAuth state: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }

    if (payload.purpose !== STATE_PURPOSE) {
      throw new UnauthorizedException('Invalid OAuth state purpose');
    }

    const userId = payload.sub;
    const returnUrl =
      payload.returnUrl ?? `${this.getDeepLinkScheme()}://oauth/hubspot`;

    // Guard against a stale OAuth state pointing at a user that no longer
    // exists (e.g. the DB was reset between starting and finishing the flow).
    // Without this, the upsert below fails with an opaque FK violation.
    const userExists = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!userExists) {
      throw new UnauthorizedException(
        'Your session is no longer valid. Please sign in again before connecting HubSpot.',
      );
    }

    const tokens = await this.exchangeCode(code);
    const introspect = await this.introspect(tokens.access_token);

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    const scopes = introspect.scopes ?? [];
    const portalId = String(introspect.hub_id);

    await this.prisma.integrationConnection.upsert({
      where: { userId_provider: { userId, provider: CrmProvider.HUBSPOT } },
      update: {
        accessToken: encryptSecret(tokens.access_token),
        refreshToken: encryptSecret(tokens.refresh_token),
        expiresAt,
        portalId,
        scopes,
        enabled: true,
      },
      create: {
        userId,
        provider: CrmProvider.HUBSPOT,
        accessToken: encryptSecret(tokens.access_token),
        refreshToken: encryptSecret(tokens.refresh_token),
        expiresAt,
        portalId,
        scopes,
        enabled: true,
      },
    });

    await this.audit(userId, 'hubspot.connect', 'success', { portalId, scopes });

    return { userId, returnUrl };
  }

  // ── Status / disconnect ─────────────────────────────────────────────────────

  async getStatus(userId: string): Promise<HubspotStatus> {
    const row = await this.prisma.integrationConnection.findUnique({
      where: { userId_provider: { userId, provider: CrmProvider.HUBSPOT } },
    });
    if (!row || !row.enabled) {
      return { connected: false };
    }
    return {
      connected: true,
      portalId: row.portalId,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      scopes: row.scopes,
    };
  }

  async disconnect(userId: string): Promise<{ ok: true }> {
    const row = await this.prisma.integrationConnection.findUnique({
      where: { userId_provider: { userId, provider: CrmProvider.HUBSPOT } },
    });
    if (row) {
      await this.prisma.integrationConnection.update({
        where: { userId_provider: { userId, provider: CrmProvider.HUBSPOT } },
        data: { enabled: false, accessToken: '', refreshToken: '' },
      });
      await this.audit(userId, 'hubspot.disconnect', 'success');
    }
    return { ok: true };
  }

  /** Clears stored tokens, then returns a fresh OAuth URL. */
  async reconnect(
    userId: string,
    returnUrl?: string,
  ): Promise<{ url: string; state: string }> {
    await this.disconnect(userId);
    return this.buildAuthUrl(userId, returnUrl);
  }

  // ── Refresh-token flow (exported for future CRM call sites) ─────────────────

  async getValidAccessToken(userId: string): Promise<{ accessToken: string; portalId: string | null }> {
    const row = await this.prisma.integrationConnection.findUnique({
      where: { userId_provider: { userId, provider: CrmProvider.HUBSPOT } },
    });
    if (!row || !row.enabled) {
      throw new ForbiddenException('HubSpot is not connected');
    }

    const fresh = row.expiresAt && row.expiresAt.getTime() - REFRESH_LEEWAY_MS > Date.now();

    if (fresh && row.accessToken) {
      return { accessToken: decryptSecret(row.accessToken), portalId: row.portalId };
    }

    if (!row.refreshToken) {
      throw new UnauthorizedException('HubSpot refresh token missing — reconnect required');
    }

    const refreshToken = decryptSecret(row.refreshToken);
    let refreshed: HubspotTokenResponse;
    try {
      refreshed = await this.refreshTokens(refreshToken);
    } catch (err) {
      this.logger.warn(`HubSpot refresh failed for user ${userId}: ${(err as Error).message}`);
      await this.prisma.integrationConnection.update({
        where: { userId_provider: { userId, provider: CrmProvider.HUBSPOT } },
        data: { enabled: false },
      });
      await this.audit(userId, 'hubspot.refresh_failed', 'failure', {
        message: (err as Error).message,
      });
      throw new UnauthorizedException('HubSpot session expired — please reconnect');
    }

    const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    // HubSpot does NOT rotate refresh tokens, so the old one stays valid.
    // We still re-store whatever they returned in case that ever changes.
    const nextRefresh = refreshed.refresh_token ?? refreshToken;
    await this.prisma.integrationConnection.update({
      where: { userId_provider: { userId, provider: CrmProvider.HUBSPOT } },
      data: {
        accessToken: encryptSecret(refreshed.access_token),
        refreshToken: encryptSecret(nextRefresh),
        expiresAt,
      },
    });

    return { accessToken: refreshed.access_token, portalId: row.portalId };
  }

  // ── HTTP helpers ────────────────────────────────────────────────────────────

  private async exchangeCode(code: string): Promise<HubspotTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.requireConfig('HUBSPOT_CLIENT_ID'),
      client_secret: this.requireConfig('HUBSPOT_CLIENT_SECRET'),
      redirect_uri: this.requireConfig('HUBSPOT_REDIRECT_URI'),
      code,
    });
    return this.postForm<HubspotTokenResponse>(OAUTH_TOKEN_URL, body);
  }

  private async refreshTokens(refreshToken: string): Promise<HubspotTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.requireConfig('HUBSPOT_CLIENT_ID'),
      client_secret: this.requireConfig('HUBSPOT_CLIENT_SECRET'),
      refresh_token: refreshToken,
    });
    return this.postForm<HubspotTokenResponse>(OAUTH_TOKEN_URL, body);
  }

  private async introspect(accessToken: string): Promise<HubspotIntrospectResponse> {
    const res = await fetch(`${OAUTH_INTROSPECT_URL}/${encodeURIComponent(accessToken)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HubSpot introspect ${res.status}: ${text.slice(0, 200)}`);
    }
    return JSON.parse(text) as HubspotIntrospectResponse;
  }

  private async postForm<T>(url: string, body: URLSearchParams): Promise<T> {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HubSpot token endpoint ${res.status}: ${text.slice(0, 200)}`);
    }
    return JSON.parse(text) as T;
  }

  // ── Misc ────────────────────────────────────────────────────────────────────

  getDeepLinkScheme(): string {
    return this.config.get<string>('APP_DEEP_LINK_SCHEME') || 'aiconcierge';
  }

  private validateReturnUrl(url: string): string {
    const trimmed = url.trim();
    if (!/^aiconcierge:\/\//i.test(trimmed) && !/^exp:\/\//i.test(trimmed)) {
      throw new BadRequestException(
        'returnUrl must use aiconcierge:// or exp:// scheme',
      );
    }
    if (!/\/oauth\/hubspot/i.test(trimmed)) {
      throw new BadRequestException('returnUrl must point to /oauth/hubspot');
    }
    return trimmed.split('?')[0] ?? trimmed;
  }

  private requireConfig(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new Error(`${key} is not set`);
    }
    return value;
  }

  private async audit(
    userId: string,
    action: string,
    status: 'success' | 'failure',
    payload?: Record<string, unknown>,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action,
          provider: CrmProvider.HUBSPOT,
          status,
          payload: payload ? (payload as object) : undefined,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to write audit log ${action}: ${(err as Error).message}`);
    }
  }
}
