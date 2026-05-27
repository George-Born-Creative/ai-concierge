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

const OAUTH_AUTHORIZE_URL = 'https://marketplace.gohighlevel.com/oauth/chooselocation';
const OAUTH_TOKEN_URL = 'https://services.leadconnectorhq.com/oauth/token';
const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2023-02-21';
// Must match scopes enabled in Marketplace → Advanced Settings → Auth.
// Add conversations.* / opportunities.* to GHL_SCOPES only after selecting them in the app builder.
const DEFAULT_SCOPES = 'contacts.readonly contacts.write';
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
  /** Mobile app deep link to return to after OAuth (from auth-url query). */
  returnUrl?: string;
};

export type GhlStatus = {
  connected: boolean;
  locationId?: string | null;
  expiresAt?: string | null;
  scopes?: string[];
};

export type GhlContactSummary = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  dateAdded?: string;
};

export type GhlContactsListResult = {
  contacts: GhlContactSummary[];
  meta?: {
    total?: number;
    startAfterId?: string | null;
  };
};

type GhlRawContact = {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  dateAdded?: string;
};

type GhlRawListResponse = {
  contacts?: GhlRawContact[];
  meta?: {
    total?: number;
    startAfterId?: string;
  };
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

  buildAuthUrl(userId: string, returnUrl?: string): { url: string; state: string } {
    const clientId = this.requireConfig('GHL_CLIENT_ID');
    const redirectUri = this.requireConfig('GHL_REDIRECT_URI');
    const scopes = this.config.get<string>('GHL_SCOPES') || DEFAULT_SCOPES;

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
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state,
    });

    return { url: `${OAUTH_AUTHORIZE_URL}?${params.toString()}`, state };
  }

  // ── OAuth: exchange code → tokens, encrypt, persist ─────────────────────────

  resolveReturnUrl(state: string): string {
    try {
      const payload = this.jwt.verify<StatePayload>(state);
      if (payload.returnUrl) return payload.returnUrl;
    } catch {
      // Fall through to default scheme link.
    }
    const scheme = this.getDeepLinkScheme();
    return `${scheme}://oauth/ghl`;
  }

  async handleCallback(code: string, state: string): Promise<{ userId: string; returnUrl: string }> {
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
    const returnUrl = payload.returnUrl ?? `${this.getDeepLinkScheme()}://oauth/ghl`;

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

    this.logger.log(
      `GHL connected for user ${userId} (locationId=${tokens.locationId ?? 'none'})`,
    );

    return { userId, returnUrl };
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

  // ── Contacts (GHL CRM) ────────────────────────────────────────────────────────

  async listContacts(
    userId: string,
    limit = 10,
    query?: string,
  ): Promise<GhlContactsListResult> {
    const { locationId } = await this.getValidAccessToken(userId);
    if (!locationId) {
      throw new BadRequestException('GHL location is missing — reconnect GoHighLevel');
    }

    const params = new URLSearchParams({
      locationId,
      limit: String(limit),
    });
    if (query?.trim()) {
      params.set('query', query.trim());
    }

    const raw = await this.ghlRequest<GhlRawListResponse>(
      userId,
      'GET',
      `/contacts/?${params.toString()}`,
    );

    const contacts = (raw.contacts ?? [])
      .map((contact) => this.toContactSummary(contact))
      .sort((a, b) => this.contactSortKey(b) - this.contactSortKey(a));

    return {
      contacts,
      meta: raw.meta
        ? { total: raw.meta.total, startAfterId: raw.meta.startAfterId ?? null }
        : undefined,
    };
  }

  async createContact(
    userId: string,
    input: {
      firstName?: string;
      lastName?: string;
      name?: string;
      email?: string;
      phone?: string;
    },
  ): Promise<GhlContactSummary> {
    const { locationId } = await this.getValidAccessToken(userId);
    if (!locationId) {
      throw new BadRequestException('GHL location is missing — reconnect GoHighLevel');
    }

    const email = input.email?.trim();
    const phone = input.phone?.trim();
    const name = input.name?.trim();
    const firstName = input.firstName?.trim();
    const lastName = input.lastName?.trim();

    if (!email && !phone) {
      throw new BadRequestException('email or phone is required');
    }
    if (!name && !firstName) {
      throw new BadRequestException('name or firstName is required');
    }

    const body: Record<string, string> = { locationId };
    if (name) body.name = name;
    if (firstName) body.firstName = firstName;
    if (lastName) body.lastName = lastName;
    if (email) body.email = email;
    if (phone) body.phone = phone;

    const raw = await this.ghlRequest<{ contact?: GhlRawContact }>(
      userId,
      'POST',
      '/contacts/',
      body,
    );

    const contact = raw.contact;
    if (!contact?.id) {
      throw new BadRequestException('GHL did not return the created contact');
    }

    await this.audit(userId, 'ghl.contact.create', 'success', { contactId: contact.id });
    return this.toContactSummary(contact);
  }

  async deleteContact(userId: string, contactId: string): Promise<{ ok: true }> {
    await this.ghlRequest(userId, 'DELETE', `/contacts/${contactId}`);
    await this.audit(userId, 'ghl.contact.delete', 'success', { contactId });
    return { ok: true };
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

  private async ghlRequest<T>(
    userId: string,
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const { accessToken } = await this.getValidAccessToken(userId);
    const res = await fetch(`${GHL_API_BASE}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        Version: GHL_API_VERSION,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(`GHL ${method} ${path} ${res.status}: ${text.slice(0, 300)}`);
      throw new BadRequestException(`GHL API error (${res.status}): ${this.extractGhlError(text)}`);
    }

    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  private toContactSummary(contact: GhlRawContact): GhlContactSummary {
    const name =
      contact.name ||
      [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
      contact.email ||
      contact.phone ||
      'Unknown';

    return {
      id: contact.id,
      name,
      phone: contact.phone,
      email: contact.email,
      dateAdded: contact.dateAdded,
    };
  }

  private contactSortKey(contact: GhlContactSummary): number {
    if (!contact.dateAdded) return 0;
    const time = new Date(contact.dateAdded).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  private extractGhlError(text: string): string {
    try {
      const body = JSON.parse(text) as { message?: string | string[] };
      if (Array.isArray(body.message)) return body.message.join(', ');
      if (typeof body.message === 'string') return body.message;
    } catch {
      // Fall through to raw text.
    }
    return text.length > 200 ? `${text.slice(0, 200)}…` : text;
  }

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

  private validateReturnUrl(url: string): string {
    const trimmed = url.trim();
    if (!/^aiconcierge:\/\//i.test(trimmed) && !/^exp:\/\//i.test(trimmed)) {
      throw new BadRequestException('returnUrl must use aiconcierge:// or exp:// scheme');
    }
    if (!/\/oauth\/(ghl|hubspot)/i.test(trimmed)) {
      throw new BadRequestException('returnUrl must point to /oauth/ghl or /oauth/hubspot');
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
