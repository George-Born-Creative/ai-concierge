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
// Must match scopes enabled in Marketplace → Advanced Settings → Auth (e.g. Calendars section).
const DEFAULT_SCOPES = [
  'contacts.readonly',
  'contacts.write',
  'calendars.readonly',
  'calendars.write',
  'calendars/events.readonly',
  'calendars/events.write',
  'calendars/groups.readonly',
  'calendars/groups.write',
  'calendars/resources.readonly',
  'calendars/resources.write',
].join(' ');
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
  /** False when the stored token was connected before calendar scopes were granted. */
  calendarScopesGranted?: boolean;
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

export type GhlCalendarSummary = {
  id: string;
  name: string;
  isActive?: boolean;
};

export type GhlCalendarsListResult = {
  calendars: GhlCalendarSummary[];
};

export type GhlAppointmentSummary = {
  id: string;
  title: string;
  startTime?: string;
  endTime?: string;
  contactId?: string;
  calendarId?: string;
  status?: string;
};

export type GhlAppointmentsListResult = {
  appointments: GhlAppointmentSummary[];
};

type GhlRawCalendar = {
  id: string;
  name?: string;
  isActive?: boolean;
};

type GhlRawCalendarsResponse = {
  calendars?: GhlRawCalendar[];
};

type GhlRawEvent = {
  id: string;
  title?: string;
  startTime?: string;
  endTime?: string;
  contactId?: string;
  calendarId?: string;
  appointmentStatus?: string;
};

type GhlRawEventsResponse = {
  events?: GhlRawEvent[];
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
      calendarScopesGranted: this.hasCalendarScopes(row.scopes),
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

  // ── Calendars (GHL) ───────────────────────────────────────────────────────────

  async listCalendars(userId: string): Promise<GhlCalendarsListResult> {
    await this.ensureCalendarScopes(userId);
    const locationId = await this.requireLocationId(userId);
    const raw = await this.ghlRequest<GhlRawCalendarsResponse>(
      userId,
      'GET',
      `/calendars/?${new URLSearchParams({ locationId }).toString()}`,
    );

    return {
      calendars: (raw.calendars ?? [])
        .filter((calendar) => calendar.id)
        .map((calendar) => ({
          id: calendar.id,
          name: calendar.name?.trim() || 'Unnamed calendar',
          isActive: calendar.isActive,
        })),
    };
  }

  async listCalendarEvents(
    userId: string,
    input: {
      calendarId?: string;
      calendarName?: string;
      startTime?: string;
      endTime?: string;
      days?: number;
    } = {},
  ): Promise<GhlAppointmentsListResult> {
    await this.ensureCalendarScopes(userId);
    const locationId = await this.requireLocationId(userId);
    const range = this.resolveEventRange(input.startTime, input.endTime, input.days ?? 14);
    const calendarIds = await this.resolveCalendarIds(userId, locationId, input);

    const appointments: GhlAppointmentSummary[] = [];
    for (const calendarId of calendarIds) {
      const params = new URLSearchParams({
        locationId,
        calendarId,
        startTime: String(range.startMs),
        endTime: String(range.endMs),
      });
      const raw = await this.ghlRequest<GhlRawEventsResponse>(
        userId,
        'GET',
        `/calendars/events?${params.toString()}`,
      );
      appointments.push(...(raw.events ?? []).map((event) => this.toAppointmentSummary(event)));
    }

    appointments.sort((a, b) => this.appointmentSortKey(a) - this.appointmentSortKey(b));
    return { appointments };
  }

  async createAppointment(
    userId: string,
    input: {
      calendarId?: string;
      calendarName?: string;
      contactId?: string;
      contactName?: string;
      startTime: string;
      endTime?: string;
      durationMinutes?: number;
      title?: string;
      notes?: string;
      timeZone?: string;
    },
  ): Promise<GhlAppointmentSummary> {
    await this.ensureCalendarScopes(userId);
    const locationId = await this.requireLocationId(userId);
    const startTime = input.startTime.trim();
    const endTime =
      input.endTime?.trim() ||
      this.addMinutesIso(startTime, input.durationMinutes ?? 30);

    const contactId =
      input.contactId?.trim() ||
      (await this.resolveContactId(userId, input.contactName));
    const calendarId =
      input.calendarId?.trim() ||
      (await this.resolveCalendarId(userId, locationId, input.calendarName));

    const body: Record<string, unknown> = {
      locationId,
      calendarId,
      contactId,
      startTime,
      endTime,
      title: input.title?.trim() || 'Appointment',
      ignoreFreeSlotValidation: true,
    };
    if (input.notes?.trim()) body.description = input.notes.trim();
    if (input.timeZone?.trim()) body.timeZone = input.timeZone.trim();

    const raw = await this.ghlRequest<{ id?: string; event?: GhlRawEvent } & GhlRawEvent>(
      userId,
      'POST',
      '/calendars/events/appointments',
      body,
    );

    const event = raw.event ?? raw;
    if (!event.id) {
      throw new BadRequestException('GHL did not return the created appointment');
    }

    await this.audit(userId, 'ghl.appointment.create', 'success', {
      appointmentId: event.id,
      calendarId,
      contactId,
    });
    return this.toAppointmentSummary(event);
  }

  async cancelAppointment(userId: string, eventId: string): Promise<{ ok: true }> {
    await this.ensureCalendarScopes(userId);
    await this.ghlRequest(userId, 'DELETE', `/calendars/events/${eventId}`);
    await this.audit(userId, 'ghl.appointment.cancel', 'success', { eventId });
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

  /** Clears stored tokens, then returns a fresh OAuth URL (contacts + calendar scopes). */
  async reconnect(userId: string, returnUrl?: string): Promise<{ url: string; state: string }> {
    await this.disconnect(userId);
    return this.buildAuthUrl(userId, returnUrl);
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
    const refreshedScopes = (refreshed.scope ?? '').split(' ').filter(Boolean);
    await this.prisma.integrationConnection.update({
      where: { userId_provider: { userId, provider: CrmProvider.GHL } },
      data: {
        accessToken: encryptSecret(refreshed.access_token),
        // GHL rotates refresh tokens on each refresh, so persist the new one.
        refreshToken: encryptSecret(refreshed.refresh_token),
        expiresAt,
        locationId: refreshed.locationId ?? row.locationId,
        scopes: refreshedScopes.length > 0 ? refreshedScopes : row.scopes,
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
      this.throwGhlHttpError(res.status, text);
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

  private async requireLocationId(userId: string): Promise<string> {
    const { locationId } = await this.getValidAccessToken(userId);
    if (!locationId) {
      throw new BadRequestException('GHL location is missing — reconnect GoHighLevel');
    }
    return locationId;
  }

  private async resolveCalendarIds(
    userId: string,
    locationId: string,
    input: { calendarId?: string; calendarName?: string },
  ): Promise<string[]> {
    if (input.calendarId?.trim()) {
      return [input.calendarId.trim()];
    }
    if (input.calendarName?.trim()) {
      return [await this.resolveCalendarId(userId, locationId, input.calendarName)];
    }
    const { calendars } = await this.listCalendars(userId);
    const active = calendars.filter((calendar) => calendar.isActive !== false);
    const ids = (active.length > 0 ? active : calendars).map((calendar) => calendar.id);
    if (ids.length === 0) {
      throw new BadRequestException('No calendars found in GoHighLevel');
    }
    return ids.slice(0, 5);
  }

  private async resolveCalendarId(
    userId: string,
    locationId: string,
    calendarName?: string,
  ): Promise<string> {
    const { calendars } = await this.listCalendars(userId);
    if (calendars.length === 0) {
      throw new BadRequestException('No calendars found in GoHighLevel');
    }

    const query = calendarName?.trim().toLowerCase();
    if (query) {
      const match = calendars.find((calendar) => calendar.name.toLowerCase().includes(query));
      if (match) return match.id;
      throw new BadRequestException(`No calendar matching "${calendarName}"`);
    }

    const active = calendars.find((calendar) => calendar.isActive !== false);
    return (active ?? calendars[0]).id;
  }

  private async resolveContactId(userId: string, contactName?: string): Promise<string> {
    const name = contactName?.trim();
    if (!name) {
      throw new BadRequestException('contact name or contactId is required');
    }

    const matches = await this.listContacts(userId, 10, name);
    const normalized = name.toLowerCase().replace(/[^\p{L}\p{N}@]+/gu, '');
    const contact = matches.contacts.find((row) => {
      const haystack = [row.name, row.phone, row.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}@]+/gu, '');
      return haystack.includes(normalized);
    });

    if (!contact) {
      throw new BadRequestException(`No contact matching "${name}" — add them first or use their exact name`);
    }
    return contact.id;
  }

  private resolveEventRange(startTime?: string, endTime?: string, days = 14) {
    const startMs = startTime ? Date.parse(startTime) : Date.now();
    if (Number.isNaN(startMs)) {
      throw new BadRequestException('startTime is not a valid date');
    }

    let endMs = endTime ? Date.parse(endTime) : startMs + days * 24 * 60 * 60 * 1000;
    if (Number.isNaN(endMs)) {
      throw new BadRequestException('endTime is not a valid date');
    }
    if (endMs <= startMs) {
      endMs = startMs + days * 24 * 60 * 60 * 1000;
    }

    return { startMs, endMs };
  }

  private addMinutesIso(iso: string, minutes: number): string {
    const time = Date.parse(iso);
    if (Number.isNaN(time)) {
      throw new BadRequestException('startTime is not a valid date');
    }
    return new Date(time + minutes * 60 * 1000).toISOString();
  }

  private toAppointmentSummary(event: GhlRawEvent): GhlAppointmentSummary {
    return {
      id: event.id,
      title: event.title?.trim() || 'Appointment',
      startTime: event.startTime,
      endTime: event.endTime,
      contactId: event.contactId,
      calendarId: event.calendarId,
      status: event.appointmentStatus,
    };
  }

  private appointmentSortKey(appointment: GhlAppointmentSummary): number {
    if (!appointment.startTime) return Number.MAX_SAFE_INTEGER;
    const time = Date.parse(appointment.startTime);
    return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
  }

  private hasCalendarScopes(scopes: string[] | undefined): boolean {
    if (!scopes?.length) return false;
    return scopes.some(
      (scope) =>
        scope === 'calendars.readonly' ||
        scope === 'calendars/events.readonly' ||
        scope.startsWith('calendars.'),
    );
  }

  private async ensureCalendarScopes(userId: string): Promise<void> {
    const row = await this.prisma.integrationConnection.findUnique({
      where: { userId_provider: { userId, provider: CrmProvider.GHL } },
    });
    if (!row?.enabled) {
      throw new ForbiddenException('GHL is not connected');
    }
    if (!this.hasCalendarScopes(row.scopes)) {
      throw new ForbiddenException(this.calendarReconnectMessage());
    }
  }

  private calendarReconnectMessage(): string {
    return (
      'Your GoHighLevel connection does not include calendar access. ' +
      'In Profile, disconnect GHL and connect again so the app can request calendar scopes. ' +
      'Ensure backend GHL_SCOPES includes calendars.readonly and calendars/events.* scopes, then restart the server.'
    );
  }

  private throwGhlHttpError(status: number, text: string): never {
    const message = this.extractGhlError(text);
    if (status === 401 && /not authorized for this scope/i.test(message)) {
      throw new ForbiddenException(this.calendarReconnectMessage());
    }
    if (status === 401) {
      throw new UnauthorizedException('GHL session expired — please reconnect in Profile');
    }
    throw new BadRequestException(`GHL API error (${status}): ${message}`);
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
