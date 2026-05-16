import {
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

const OAUTH_AUTHORIZE_URL = 'https://marketplace.gohighlevel.com/oauth/chooselocation';
const OAUTH_TOKEN_URL = 'https://services.leadconnectorhq.com/oauth/token';
const DEFAULT_SCOPES =
  'contacts.readonly contacts.write conversations.readonly conversations.write opportunities.readonly opportunities.write locations.readonly';
const STATE_PURPOSE = 'ghl-oauth-state';
const STATE_TTL = '10m';
// Refresh ~60s before actual expiry so in-flight calls never get a 401.
const REFRESH_LEEWAY_MS = 60 * 1000;

type GhlTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  userType?: string;
  locationId?: string;
  companyId?: string;
};

type StatePayload = {
  sub: string;
  purpose: typeof STATE_PURPOSE;
  nonce: string;
};

export type GhlStatus = {
  connected: boolean;
  locationId?: string | null;
  expiresAt?: string | null;
  scopes?: string[];
};

@Injectable()
export class GhlService {
  private readonly logger = new Logger(GhlService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  // ── OAuth: build the authorize URL the mobile app opens in a browser ────────

  buildAuthUrl(userId: string): { url: string; state: string } {
    const clientId = this.requireConfig('GHL_CLIENT_ID');
    const redirectUri = this.requireConfig('GHL_REDIRECT_URI');
    const scopes = this.config.get<string>('GHL_SCOPES') || DEFAULT_SCOPES;

    const state = this.jwt.sign(
      { sub: userId, purpose: STATE_PURPOSE, nonce: randomBytes(8).toString('hex') } satisfies StatePayload,
      { expiresIn: STATE_TTL },
    );

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state,
    });

    return { url: `${OAUTH_AUTHORIZE_URL}?${params.toString()}`, state };
  }

  // ── OAuth: exchange code → tokens, encrypt, persist ─────────────────────────

  async handleCallback(code: string, state: string): Promise<{ userId: string }> {
    let payload: StatePayload;
    try {
      payload = this.jwt.verify<StatePayload>(state);
    } catch (err) {
      this.logger.warn(`Invalid GHL OAuth state: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }

    if (payload.purpose !== STATE_PURPOSE) {
      throw new UnauthorizedException('Invalid OAuth state purpose');
    }

    const userId = payload.sub;

    const tokens = await this.exchangeCode(code);

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    const scopes = (tokens.scope ?? '').split(' ').filter(Boolean);

    await this.prisma.integrationConnection.upsert({
      where: { userId_provider: { userId, provider: CrmProvider.GHL } },
      update: {
        accessToken: encryptSecret(tokens.access_token),
        refreshToken: encryptSecret(tokens.refresh_token),
        expiresAt,
        locationId: tokens.locationId ?? null,
        scopes,
        enabled: true,
      },
      create: {
        userId,
        provider: CrmProvider.GHL,
        accessToken: encryptSecret(tokens.access_token),
        refreshToken: encryptSecret(tokens.refresh_token),
        expiresAt,
        locationId: tokens.locationId ?? null,
        scopes,
        enabled: true,
      },
    });

    await this.audit(userId, 'ghl.connect', 'success', {
      locationId: tokens.locationId ?? null,
      scopes,
    });

    return { userId };
  }

  // ── Status / disconnect ─────────────────────────────────────────────────────

  async getStatus(userId: string): Promise<GhlStatus> {
    const row = await this.prisma.integrationConnection.findUnique({
      where: { userId_provider: { userId, provider: CrmProvider.GHL } },
    });
    if (!row || !row.enabled) {
      return { connected: false };
    }
    return {
      connected: true,
      locationId: row.locationId,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      scopes: row.scopes,
    };
  }

  async disconnect(userId: string): Promise<{ ok: true }> {
    const row = await this.prisma.integrationConnection.findUnique({
      where: { userId_provider: { userId, provider: CrmProvider.GHL } },
    });
    if (row) {
      await this.prisma.integrationConnection.update({
        where: { userId_provider: { userId, provider: CrmProvider.GHL } },
        data: { enabled: false, accessToken: '', refreshToken: '' },
      });
      await this.audit(userId, 'ghl.disconnect', 'success');
    }
    return { ok: true };
  }

  // ── Refresh-token flow (exported for future CRM call sites) ─────────────────

  async getValidAccessToken(userId: string): Promise<{ accessToken: string; locationId: string | null }> {
    const row = await this.prisma.integrationConnection.findUnique({
      where: { userId_provider: { userId, provider: CrmProvider.GHL } },
    });
    if (!row || !row.enabled) {
      throw new ForbiddenException('GHL is not connected');
    }

    const fresh =
      row.expiresAt && row.expiresAt.getTime() - REFRESH_LEEWAY_MS > Date.now();

    if (fresh && row.accessToken) {
      return { accessToken: decryptSecret(row.accessToken), locationId: row.locationId };
    }

    if (!row.refreshToken) {
      throw new UnauthorizedException('GHL refresh token missing — reconnect required');
    }

    const refreshToken = decryptSecret(row.refreshToken);
    let refreshed: GhlTokenResponse;
    try {
      refreshed = await this.refreshTokens(refreshToken);
    } catch (err) {
      this.logger.warn(`GHL refresh failed for user ${userId}: ${(err as Error).message}`);
      await this.prisma.integrationConnection.update({
        where: { userId_provider: { userId, provider: CrmProvider.GHL } },
        data: { enabled: false },
      });
      await this.audit(userId, 'ghl.refresh_failed', 'failure', { message: (err as Error).message });
      throw new UnauthorizedException('GHL session expired — please reconnect');
    }

    const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    await this.prisma.integrationConnection.update({
      where: { userId_provider: { userId, provider: CrmProvider.GHL } },
      data: {
        accessToken: encryptSecret(refreshed.access_token),
        // GHL rotates refresh tokens on each refresh, so persist the new one.
        refreshToken: encryptSecret(refreshed.refresh_token),
        expiresAt,
        locationId: refreshed.locationId ?? row.locationId,
      },
    });

    return {
      accessToken: refreshed.access_token,
      locationId: refreshed.locationId ?? row.locationId,
    };
  }

  // ── HTTP helpers ────────────────────────────────────────────────────────────

  private async exchangeCode(code: string): Promise<GhlTokenResponse> {
    const body = new URLSearchParams({
      client_id: this.requireConfig('GHL_CLIENT_ID'),
      client_secret: this.requireConfig('GHL_CLIENT_SECRET'),
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.requireConfig('GHL_REDIRECT_URI'),
      user_type: 'Location',
    });
    return this.postForm(OAUTH_TOKEN_URL, body);
  }

  private async refreshTokens(refreshToken: string): Promise<GhlTokenResponse> {
    const body = new URLSearchParams({
      client_id: this.requireConfig('GHL_CLIENT_ID'),
      client_secret: this.requireConfig('GHL_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      user_type: 'Location',
    });
    return this.postForm(OAUTH_TOKEN_URL, body);
  }

  private async postForm(url: string, body: URLSearchParams): Promise<GhlTokenResponse> {
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
      throw new Error(`GHL token endpoint ${res.status}: ${text.slice(0, 200)}`);
    }
    return JSON.parse(text) as GhlTokenResponse;
  }

  // ── Misc ────────────────────────────────────────────────────────────────────

  getDeepLinkScheme(): string {
    return this.config.get<string>('APP_DEEP_LINK_SCHEME') || 'aiconcierge';
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
          provider: CrmProvider.GHL,
          status,
          payload: payload ? (payload as object) : undefined,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to write audit log ${action}: ${(err as Error).message}`);
    }
  }
}
