import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
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
/** Calendar / appointment routes require this version (contacts use GHL_API_VERSION). */
const GHL_CALENDAR_API_VERSION = '2021-04-15';
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
  'opportunities.readonly',
  'opportunities.write',
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
  /** False when the stored token was connected before opportunity scopes were granted. */
  opportunityScopesGranted?: boolean;
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
  slotDuration?: number;
  slotDurationUnit?: string;
  timezone?: string;
  selectedTimezone?: string;
};

type GhlRawCalendarsResponse = {
  calendars?: GhlRawCalendar[];
};

type GhlRawEvent = {
  id: string;
  title?: string;
  /** ISO string, epoch ms, or occasionally a nested object from GHL. */
  startTime?: string | number | Record<string, unknown>;
  endTime?: string | number | Record<string, unknown>;
  contactId?: string;
  calendarId?: string;
  appointmentStatus?: string;
};

type GhlRawEventsResponse = {
  events?: GhlRawEvent[];
};

export type GhlOpportunityStatus = 'open' | 'won' | 'lost' | 'abandoned';
export type GhlOpportunityStatusFilter = GhlOpportunityStatus | 'all';

export type GhlPipelineStageSummary = {
  id: string;
  name: string;
  position?: number;
};

export type GhlPipelineSummary = {
  id: string;
  name: string;
  stages: GhlPipelineStageSummary[];
};

export type GhlPipelinesListResult = {
  pipelines: GhlPipelineSummary[];
};

export type GhlOpportunitySummary = {
  id: string;
  name: string;
  monetaryValue?: number;
  status: GhlOpportunityStatus;
  pipelineId: string;
  pipelineStageId?: string;
  pipelineStageName?: string;
  contactId?: string;
  contactName?: string;
  assignedTo?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type GhlOpportunitiesListResult = {
  opportunities: GhlOpportunitySummary[];
  meta?: {
    total?: number;
    nextPageUrl?: string | null;
  };
};

type GhlRawPipelineStage = {
  id?: string;
  _id?: string;
  name?: string;
  position?: number;
  showInFunnel?: boolean;
  showInPieChart?: boolean;
};

type GhlRawPipeline = {
  id?: string;
  _id?: string;
  name?: string;
  stages?: GhlRawPipelineStage[];
};

type GhlRawPipelinesResponse = {
  pipelines?: GhlRawPipeline[];
};

type GhlRawOpportunityContact = {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
};

type GhlRawOpportunity = {
  id?: string;
  _id?: string;
  name?: string;
  monetaryValue?: number | string;
  status?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  pipelineStageName?: string;
  contactId?: string;
  contact?: GhlRawOpportunityContact;
  assignedTo?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
  dateAdded?: string;
  dateUpdated?: string;
};

type GhlRawOpportunitiesResponse = {
  opportunities?: GhlRawOpportunity[];
  meta?: {
    total?: number;
    nextPageUrl?: string | null;
    startAfter?: number | string;
    startAfterId?: string | null;
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

    // Guard against a stale OAuth state pointing at a user that no longer
    // exists (e.g. the DB was reset between starting and finishing the flow).
    // Without this, the upsert below fails with an opaque FK violation.
    const userExists = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!userExists) {
      throw new UnauthorizedException(
        'Your session is no longer valid. Please sign in again before connecting GoHighLevel.',
      );
    }

    const tokens = await this.exchangeCode(code);

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    const scopes = this.resolveStoredScopes(tokens.scope);

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
      `GHL connected for user ${userId} (locationId=${tokens.locationId ?? 'none'}, tokenScope=${tokens.scope ?? 'none'}, storedScopes=${scopes.length})`,
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

    const scopes = this.resolveStoredScopes(undefined, row.scopes);
    if (scopes.length !== row.scopes.length || scopes.some((scope, i) => scope !== row.scopes[i])) {
      await this.prisma.integrationConnection.update({
        where: { userId_provider: { userId, provider: CrmProvider.GHL } },
        data: { scopes },
      });
    }

    return {
      connected: true,
      locationId: row.locationId,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      scopes,
      calendarScopesGranted: this.hasCalendarScopes(scopes),
      opportunityScopesGranted: this.hasOpportunityScopes(scopes),
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

  async updateContact(
    userId: string,
    contactId: string,
    input: {
      firstName?: string;
      lastName?: string;
      name?: string;
      email?: string;
      phone?: string;
    },
  ): Promise<GhlContactSummary> {
    if (!contactId?.trim()) {
      throw new BadRequestException('contactId is required');
    }
    const body: Record<string, string> = {};
    if (input.firstName?.trim()) body.firstName = input.firstName.trim();
    if (input.lastName?.trim()) body.lastName = input.lastName.trim();
    if (input.name?.trim()) body.name = input.name.trim();
    if (input.email?.trim()) body.email = input.email.trim();
    if (input.phone?.trim()) body.phone = input.phone.trim();
    if (Object.keys(body).length === 0) {
      throw new BadRequestException('Nothing to update — give me a field like phone, email, or name.');
    }

    const raw = await this.ghlRequest<{ contact?: GhlRawContact } & GhlRawContact>(
      userId,
      'PUT',
      `/contacts/${contactId.trim()}`,
      body,
    );
    const contact = raw.contact ?? raw;
    if (!contact?.id) {
      throw new BadRequestException('GHL did not return the updated contact');
    }
    await this.audit(userId, 'ghl.contact.update', 'success', {
      contactId,
      fields: Object.keys(body),
    });
    return this.toContactSummary(contact);
  }

  // ── Calendars (GHL) ───────────────────────────────────────────────────────────

  async listCalendars(userId: string): Promise<GhlCalendarsListResult> {
    const locationId = await this.requireLocationId(userId);
    const raw = await this.ghlRequest<GhlRawCalendarsResponse>(
      userId,
      'GET',
      `/calendars/?${new URLSearchParams({ locationId }).toString()}`,
    );

    return {
      calendars: (raw.calendars ?? [])
        .filter((calendar) => calendar.id)
        .map((calendar) => this.toCalendarSummary(calendar)),
    };
  }

  async getCalendar(userId: string, calendarId: string): Promise<GhlCalendarSummary> {
    const raw = await this.ghlRequest<{ calendar?: GhlRawCalendar } & GhlRawCalendar>(
      userId,
      'GET',
      `/calendars/${calendarId}`,
    );
    const calendar = raw.calendar ?? raw;
    if (!calendar.id) {
      throw new BadRequestException('GHL did not return the calendar');
    }
    return this.toCalendarSummary(calendar);
  }

  async createCalendar(
    userId: string,
    input: {
      name: string;
      description?: string;
      isActive?: boolean;
      options?: Record<string, unknown>;
    },
  ): Promise<GhlCalendarSummary> {
    const locationId = await this.requireLocationId(userId);
    const body: Record<string, unknown> = {
      locationId,
      name: input.name.trim(),
      ...(input.options ?? {}),
    };
    if (input.description?.trim()) body.description = input.description.trim();
    if (input.isActive !== undefined) body.isActive = input.isActive;

    const raw = await this.ghlRequest<{ calendar?: GhlRawCalendar } & GhlRawCalendar>(
      userId,
      'POST',
      '/calendars/',
      body,
    );
    const calendar = raw.calendar ?? raw;
    if (!calendar.id) {
      throw new BadRequestException('GHL did not return the created calendar');
    }
    await this.audit(userId, 'ghl.calendar.create', 'success', { calendarId: calendar.id });
    return this.toCalendarSummary(calendar);
  }

  async updateCalendar(
    userId: string,
    calendarId: string,
    input: {
      name?: string;
      description?: string;
      isActive?: boolean;
      options?: Record<string, unknown>;
    },
  ): Promise<GhlCalendarSummary> {
    const body: Record<string, unknown> = { ...(input.options ?? {}) };
    if (input.name?.trim()) body.name = input.name.trim();
    if (input.description?.trim()) body.description = input.description.trim();
    if (input.isActive !== undefined) body.isActive = input.isActive;

    const raw = await this.ghlRequest<{ calendar?: GhlRawCalendar } & GhlRawCalendar>(
      userId,
      'PUT',
      `/calendars/${calendarId}`,
      body,
    );
    const calendar = raw.calendar ?? raw;
    if (!calendar.id) {
      throw new BadRequestException('GHL did not return the updated calendar');
    }
    await this.audit(userId, 'ghl.calendar.update', 'success', { calendarId: calendar.id });
    return this.toCalendarSummary(calendar);
  }

  async deleteCalendar(userId: string, calendarId: string): Promise<{ ok: true }> {
    await this.ghlRequest(userId, 'DELETE', `/calendars/${calendarId}`);
    await this.audit(userId, 'ghl.calendar.delete', 'success', { calendarId });
    return { ok: true };
  }

  async getCalendarFreeSlots(
    userId: string,
    calendarId: string,
    input: {
      startDate: number;
      endDate: number;
      timezone?: string;
      userId?: string;
    },
  ): Promise<Record<string, unknown>> {
    const params = new URLSearchParams({
      startDate: String(input.startDate),
      endDate: String(input.endDate),
    });
    if (input.timezone?.trim()) params.set('timezone', input.timezone.trim());
    if (input.userId?.trim()) params.set('userId', input.userId.trim());

    return this.ghlRequest<Record<string, unknown>>(
      userId,
      'GET',
      `/calendars/${calendarId}/free-slots?${params.toString()}`,
    );
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
    const locationId = await this.requireLocationId(userId);
    const range = this.resolveEventRange(input.startTime, input.endTime, input.days ?? 14);
    const calendarIds = await this.resolveCalendarIds(userId, locationId, input);

    const appointments: GhlAppointmentSummary[] = [];
    const calendarTimeZones = new Map<string, string>();
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

      let timeZone = calendarTimeZones.get(calendarId);
      if (!timeZone) {
        const calendarRaw = await this.ghlRequest<{ calendar?: GhlRawCalendar } & GhlRawCalendar>(
          userId,
          'GET',
          `/calendars/${calendarId}`,
        );
        timeZone = this.resolveCalendarTimeZone(undefined, calendarRaw.calendar ?? calendarRaw);
        calendarTimeZones.set(calendarId, timeZone);
      }

      appointments.push(
        ...(raw.events ?? []).map((event) => this.toAppointmentSummary(event, timeZone)),
      );
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
    const locationId = await this.requireLocationId(userId);

    const contactId =
      input.contactId?.trim() ||
      (await this.resolveContactId(userId, input.contactName));
    const calendarId =
      input.calendarId?.trim() ||
      (await this.resolveCalendarId(userId, locationId, input.calendarName));

    const calendarRaw = await this.ghlRequest<{ calendar?: GhlRawCalendar } & GhlRawCalendar>(
      userId,
      'GET',
      `/calendars/${calendarId}`,
    );
    const calendar = calendarRaw.calendar ?? calendarRaw;
    const slotMinutes = this.calendarSlotMinutes(calendar);
    const timeZone = this.resolveCalendarTimeZone(input.timeZone, calendar);
    const { startTime, endTime } = this.buildGhlAppointmentRange(
      input.startTime.trim(),
      input.endTime?.trim(),
      input.durationMinutes,
      slotMinutes,
      timeZone,
    );

    const body: Record<string, unknown> = {
      locationId,
      calendarId,
      contactId,
      startTime,
      endTime,
      title: input.title?.trim() || 'Appointment',
      appointmentStatus: 'confirmed',
      ignoreDateRange: true,
      ignoreFreeSlotValidation: true,
    };
    if (input.notes?.trim()) body.description = input.notes.trim();

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
    return this.toAppointmentSummary(event, timeZone);
  }

  async cancelAppointment(userId: string, eventId: string): Promise<{ ok: true }> {
    await this.ghlRequest(userId, 'DELETE', `/calendars/events/${eventId}`);
    await this.audit(userId, 'ghl.appointment.cancel', 'success', { eventId });
    return { ok: true };
  }

  // ── Opportunities ───────────────────────────────────────────────────────────

  async listPipelines(userId: string): Promise<GhlPipelinesListResult> {
    await this.requireOpportunityScopes(userId);
    const locationId = await this.requireLocationId(userId);

    const raw = await this.ghlRequest<GhlRawPipelinesResponse>(
      userId,
      'GET',
      `/opportunities/pipelines?${new URLSearchParams({ locationId }).toString()}`,
    );

    return {
      pipelines: (raw.pipelines ?? [])
        .map((pipeline) => this.toPipelineSummary(pipeline))
        .filter((pipeline): pipeline is GhlPipelineSummary => Boolean(pipeline.id)),
    };
  }

  async listOpportunities(
    userId: string,
    input: {
      pipelineId?: string;
      pipelineStageId?: string;
      status?: GhlOpportunityStatusFilter;
      query?: string;
      contactId?: string;
      assignedTo?: string;
      campaignId?: string;
      order?: 'added_asc' | 'added_desc' | 'updated_asc' | 'updated_desc';
      limit?: number;
      page?: number;
    } = {},
  ): Promise<GhlOpportunitiesListResult> {
    await this.requireOpportunityScopes(userId);
    const locationId = await this.requireLocationId(userId);

    // GHL /opportunities/search expects snake_case params and uses `q` for the
    // free-text search field (see SDK `searchOpportunity`).
    const params = new URLSearchParams({
      location_id: locationId,
      limit: String(input.limit ?? 20),
    });
    if (input.pipelineId?.trim()) params.set('pipeline_id', input.pipelineId.trim());
    if (input.pipelineStageId?.trim()) {
      params.set('pipeline_stage_id', input.pipelineStageId.trim());
    }
    if (input.status && input.status !== 'all') params.set('status', input.status);
    if (input.query?.trim()) params.set('q', input.query.trim());
    if (input.contactId?.trim()) params.set('contact_id', input.contactId.trim());
    if (input.assignedTo?.trim()) params.set('assigned_to', input.assignedTo.trim());
    if (input.campaignId?.trim()) params.set('campaignId', input.campaignId.trim());
    if (input.order) params.set('order', input.order);
    if (input.page && input.page > 1) params.set('page', String(input.page));

    const raw = await this.ghlRequest<GhlRawOpportunitiesResponse>(
      userId,
      'GET',
      `/opportunities/search?${params.toString()}`,
    );

    return {
      opportunities: (raw.opportunities ?? [])
        .map((opportunity) => this.toOpportunitySummary(opportunity))
        .filter((opportunity): opportunity is GhlOpportunitySummary => Boolean(opportunity.id)),
      meta: raw.meta
        ? {
            total: raw.meta.total,
            nextPageUrl: raw.meta.nextPageUrl ?? null,
          }
        : undefined,
    };
  }

  async getOpportunity(userId: string, opportunityId: string): Promise<GhlOpportunitySummary> {
    await this.requireOpportunityScopes(userId);
    const id = opportunityId?.trim();
    if (!id) {
      throw new BadRequestException('opportunityId is required');
    }

    const raw = await this.ghlRequest<{ opportunity?: GhlRawOpportunity } & GhlRawOpportunity>(
      userId,
      'GET',
      `/opportunities/${id}`,
    );
    const opportunity = raw.opportunity ?? raw;
    if (!opportunity.id && !opportunity._id) {
      throw new NotFoundException('Opportunity not found');
    }
    return this.toOpportunitySummary(opportunity);
  }

  async createOpportunity(
    userId: string,
    input: {
      pipelineId: string;
      name: string;
      pipelineStageId?: string;
      status?: GhlOpportunityStatus;
      monetaryValue?: number;
      contactId?: string;
      assignedTo?: string;
      source?: string;
    },
  ): Promise<GhlOpportunitySummary> {
    await this.requireOpportunityScopes(userId);
    const locationId = await this.requireLocationId(userId);

    const name = input.name?.trim();
    const pipelineId = input.pipelineId?.trim();
    const contactId = input.contactId?.trim();
    if (!name) {
      throw new BadRequestException('name is required');
    }
    if (!pipelineId) {
      throw new BadRequestException('pipelineId is required');
    }
    // GHL rejects opportunity creation without a contactId. Surface a clean
    // error here rather than letting the API return a 422.
    if (!contactId) {
      throw new BadRequestException('contactId is required to create an opportunity');
    }

    const body: Record<string, unknown> = {
      locationId,
      pipelineId,
      name,
      contactId,
      status: input.status ?? 'open',
    };
    if (input.pipelineStageId?.trim()) body.pipelineStageId = input.pipelineStageId.trim();
    if (typeof input.monetaryValue === 'number') body.monetaryValue = input.monetaryValue;
    if (input.assignedTo?.trim()) body.assignedTo = input.assignedTo.trim();
    if (input.source?.trim()) body.source = input.source.trim();

    const raw = await this.ghlRequest<{ opportunity?: GhlRawOpportunity } & GhlRawOpportunity>(
      userId,
      'POST',
      '/opportunities/',
      body,
    );
    const opportunity = raw.opportunity ?? raw;
    if (!opportunity.id && !opportunity._id) {
      throw new BadRequestException('GHL did not return the created opportunity');
    }

    const summary = this.toOpportunitySummary(opportunity);
    await this.audit(userId, 'ghl.opportunity.create', 'success', {
      opportunityId: summary.id,
      pipelineId,
    });
    return summary;
  }

  async updateOpportunity(
    userId: string,
    opportunityId: string,
    input: {
      name?: string;
      pipelineId?: string;
      pipelineStageId?: string;
      status?: GhlOpportunityStatus;
      monetaryValue?: number;
      assignedTo?: string;
      source?: string;
    },
  ): Promise<GhlOpportunitySummary> {
    await this.requireOpportunityScopes(userId);
    const id = opportunityId?.trim();
    if (!id) {
      throw new BadRequestException('opportunityId is required');
    }

    const body: Record<string, unknown> = {};
    if (input.name?.trim()) body.name = input.name.trim();
    if (input.pipelineId?.trim()) body.pipelineId = input.pipelineId.trim();
    if (input.pipelineStageId?.trim()) body.pipelineStageId = input.pipelineStageId.trim();
    if (input.status) body.status = input.status;
    if (typeof input.monetaryValue === 'number') body.monetaryValue = input.monetaryValue;
    if (input.assignedTo?.trim()) body.assignedTo = input.assignedTo.trim();
    if (input.source?.trim()) body.source = input.source.trim();

    if (Object.keys(body).length === 0) {
      throw new BadRequestException('Provide at least one field to update');
    }

    const raw = await this.ghlRequest<{ opportunity?: GhlRawOpportunity } & GhlRawOpportunity>(
      userId,
      'PUT',
      `/opportunities/${id}`,
      body,
    );
    const opportunity = raw.opportunity ?? raw;
    if (!opportunity.id && !opportunity._id) {
      throw new BadRequestException('GHL did not return the updated opportunity');
    }

    const summary = this.toOpportunitySummary(opportunity);
    await this.audit(userId, 'ghl.opportunity.update', 'success', {
      opportunityId: summary.id,
      fields: Object.keys(body),
    });
    return summary;
  }

  async updateOpportunityStatus(
    userId: string,
    opportunityId: string,
    status: GhlOpportunityStatus,
    lostReasonId?: string,
  ): Promise<GhlOpportunitySummary> {
    await this.requireOpportunityScopes(userId);
    const id = opportunityId?.trim();
    if (!id) {
      throw new BadRequestException('opportunityId is required');
    }

    const body: Record<string, unknown> = { status };
    if (lostReasonId?.trim()) body.lostReasonId = lostReasonId.trim();

    const raw = await this.ghlRequest<{ opportunity?: GhlRawOpportunity } & GhlRawOpportunity>(
      userId,
      'PUT',
      `/opportunities/${id}/status`,
      body,
    );
    const opportunity = raw.opportunity ?? raw;
    if (!opportunity.id && !opportunity._id) {
      // Some GHL responses for this endpoint return only `{ success: true }`.
      // Fetch the latest record so callers always get a full summary back.
      const refreshed = await this.getOpportunity(userId, id);
      await this.audit(userId, 'ghl.opportunity.status', 'success', {
        opportunityId: refreshed.id,
        status,
      });
      return refreshed;
    }

    const summary = this.toOpportunitySummary(opportunity);
    await this.audit(userId, 'ghl.opportunity.status', 'success', {
      opportunityId: summary.id,
      status,
    });
    return summary;
  }

  async deleteOpportunity(userId: string, opportunityId: string): Promise<{ ok: true }> {
    await this.requireOpportunityScopes(userId);
    const id = opportunityId?.trim();
    if (!id) {
      throw new BadRequestException('opportunityId is required');
    }

    await this.ghlRequest(userId, 'DELETE', `/opportunities/${id}`);
    await this.audit(userId, 'ghl.opportunity.delete', 'success', { opportunityId: id });
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
    const scopes = this.resolveStoredScopes(refreshed.scope, row.scopes);
    await this.prisma.integrationConnection.update({
      where: { userId_provider: { userId, provider: CrmProvider.GHL } },
      data: {
        accessToken: encryptSecret(refreshed.access_token),
        // GHL rotates refresh tokens on each refresh, so persist the new one.
        refreshToken: encryptSecret(refreshed.refresh_token),
        expiresAt,
        locationId: refreshed.locationId ?? row.locationId,
        scopes,
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
        Version: this.ghlApiVersion(path),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(`GHL ${method} ${path} ${res.status}: ${text.slice(0, 300)}`);
      this.throwGhlHttpError(res.status, text, path);
    }

    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  private ghlApiVersion(path: string): string {
    return path.startsWith('/calendars') ? GHL_CALENDAR_API_VERSION : GHL_API_VERSION;
  }

  private toCalendarSummary(calendar: GhlRawCalendar): GhlCalendarSummary {
    return {
      id: calendar.id,
      name: calendar.name?.trim() || 'Unnamed calendar',
      isActive: calendar.isActive,
    };
  }

  private toPipelineSummary(pipeline: GhlRawPipeline): GhlPipelineSummary {
    const id = (pipeline.id ?? pipeline._id ?? '').trim();
    const stages: GhlPipelineStageSummary[] = [];
    for (const stage of pipeline.stages ?? []) {
      const stageId = (stage.id ?? stage._id ?? '').trim();
      if (!stageId) continue;
      const summary: GhlPipelineStageSummary = {
        id: stageId,
        name: stage.name?.trim() || 'Unnamed stage',
      };
      if (typeof stage.position === 'number') summary.position = stage.position;
      stages.push(summary);
    }

    return {
      id,
      name: pipeline.name?.trim() || 'Unnamed pipeline',
      stages,
    };
  }

  private toOpportunitySummary(opportunity: GhlRawOpportunity): GhlOpportunitySummary {
    const id = (opportunity.id ?? opportunity._id ?? '').trim();
    const contactName = opportunity.contact
      ? opportunity.contact.name?.trim() ||
        [opportunity.contact.firstName, opportunity.contact.lastName]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        opportunity.contact.email?.trim() ||
        opportunity.contact.phone?.trim() ||
        undefined
      : undefined;

    const monetaryValue =
      typeof opportunity.monetaryValue === 'string'
        ? Number(opportunity.monetaryValue)
        : opportunity.monetaryValue;

    return {
      id,
      name: opportunity.name?.trim() || 'Untitled opportunity',
      monetaryValue:
        typeof monetaryValue === 'number' && !Number.isNaN(monetaryValue) ? monetaryValue : undefined,
      status: this.normalizeOpportunityStatus(opportunity.status),
      pipelineId: opportunity.pipelineId ?? '',
      pipelineStageId: opportunity.pipelineStageId,
      pipelineStageName: opportunity.pipelineStageName?.trim() || undefined,
      contactId: opportunity.contactId ?? opportunity.contact?.id,
      contactName,
      assignedTo: opportunity.assignedTo,
      source: opportunity.source,
      createdAt: opportunity.createdAt ?? opportunity.dateAdded,
      updatedAt: opportunity.updatedAt ?? opportunity.dateUpdated,
    };
  }

  private normalizeOpportunityStatus(value: string | undefined): GhlOpportunityStatus {
    const normalized = value?.trim().toLowerCase();
    if (normalized === 'won' || normalized === 'lost' || normalized === 'abandoned') {
      return normalized;
    }
    return 'open';
  }

  private getConfiguredScopes(): string[] {
    return (this.config.get<string>('GHL_SCOPES') || DEFAULT_SCOPES).split(' ').filter(Boolean);
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

  private resolveCalendarTimeZone(inputTimeZone: string | undefined, calendar: GhlRawCalendar): string {
    const fromInput = inputTimeZone?.trim();
    if (fromInput) return fromInput;
    const fromCalendar = calendar.timezone?.trim() || calendar.selectedTimezone?.trim();
    if (fromCalendar) return fromCalendar;
    return this.config.get<string>('GHL_CALENDAR_TIMEZONE')?.trim() || 'UTC';
  }

  private calendarSlotMinutes(calendar: GhlRawCalendar): number {
    const duration = calendar.slotDuration ?? 30;
    const unit = (calendar.slotDurationUnit ?? 'mins').toLowerCase();
    if (unit.startsWith('hour')) return Math.max(5, duration * 60);
    return Math.max(5, duration);
  }

  private buildGhlAppointmentRange(
    startTime: string,
    endTime: string | undefined,
    durationMinutes: number | undefined,
    slotMinutes: number,
    timeZone: string,
  ): { startTime: string; endTime: string } {
    const startMs = this.parseAppointmentTime(startTime);
    const snappedStartMs = this.snapToCalendarSlot(startMs, slotMinutes, timeZone);

    let endMs: number;
    if (endTime) {
      endMs = this.parseAppointmentTime(endTime);
    } else {
      const requestedMinutes = durationMinutes ?? slotMinutes;
      const slotCount = Math.max(1, Math.round(requestedMinutes / slotMinutes));
      endMs = snappedStartMs + slotCount * slotMinutes * 60 * 1000;
    }

    if (endMs <= snappedStartMs) {
      endMs = snappedStartMs + slotMinutes * 60 * 1000;
    }

    const spanMinutes = (endMs - snappedStartMs) / (60 * 1000);
    if (spanMinutes % slotMinutes !== 0) {
      const slotCount = Math.max(1, Math.round(spanMinutes / slotMinutes));
      endMs = snappedStartMs + slotCount * slotMinutes * 60 * 1000;
    }

    return {
      startTime: this.formatGhlDateTime(snappedStartMs, timeZone),
      endTime: this.formatGhlDateTime(endMs, timeZone),
    };
  }

  private parseAppointmentTime(value: string): number {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) {
      throw new BadRequestException('startTime is not a valid date');
    }
    return ms;
  }

  private snapToCalendarSlot(epochMs: number, slotMinutes: number, timeZone: string): number {
    if (slotMinutes <= 0) return epochMs;

    const wall = this.wallTimeParts(epochMs, timeZone);
    let totalMinutes = wall.hour * 60 + wall.minute;
    totalMinutes = Math.round(totalMinutes / slotMinutes) * slotMinutes;

    let hour = Math.floor(totalMinutes / 60);
    let minute = totalMinutes % 60;
    let { year, month, day } = wall;

    if (hour >= 24) {
      hour -= 24;
      const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
      year = nextDay.getUTCFullYear();
      month = nextDay.getUTCMonth() + 1;
      day = nextDay.getUTCDate();
    }

    return this.zonedTimeToUtc(year, month, day, hour, minute, 0, timeZone);
  }

  private wallTimeParts(epochMs: number, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date(epochMs));

    const part = (type: Intl.DateTimeFormatPart['type']) =>
      Number(parts.find((p) => p.type === type)?.value ?? '0');

    return {
      year: part('year'),
      month: part('month'),
      day: part('day'),
      hour: part('hour'),
      minute: part('minute'),
      second: part('second'),
    };
  }

  private zonedTimeToUtc(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    timeZone: string,
  ): number {
    let utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
    for (let i = 0; i < 4; i++) {
      const wall = this.wallTimeParts(utcGuess, timeZone);
      const desired = Date.UTC(year, month - 1, day, hour, minute, second);
      const actual = Date.UTC(
        wall.year,
        wall.month - 1,
        wall.day,
        wall.hour,
        wall.minute,
        wall.second,
      );
      utcGuess += desired - actual;
    }
    return utcGuess;
  }

  /** GHL expects ISO 8601 with a numeric offset, e.g. 2026-05-27T14:00:00-04:00 (not UTC Z). */
  private formatGhlDateTime(epochMs: number, timeZone: string): string {
    const wall = this.wallTimeParts(epochMs, timeZone);
    const y = String(wall.year).padStart(4, '0');
    const mo = String(wall.month).padStart(2, '0');
    const d = String(wall.day).padStart(2, '0');
    const h = String(wall.hour).padStart(2, '0');
    const mi = String(wall.minute).padStart(2, '0');
    const s = String(wall.second).padStart(2, '0');
    return `${y}-${mo}-${d}T${h}:${mi}:${s}${this.formatGhlOffset(epochMs, timeZone)}`;
  }

  private formatGhlOffset(epochMs: number, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date(epochMs));
    const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    const match = raw.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!match) return '+00:00';
    const sign = match[1];
    const hours = match[2].padStart(2, '0');
    const minutes = (match[3] ?? '00').padStart(2, '0');
    return `${sign}${hours}:${minutes}`;
  }

  private toAppointmentSummary(event: GhlRawEvent, timeZone?: string): GhlAppointmentSummary {
    const tz = timeZone ?? (this.config.get<string>('GHL_CALENDAR_TIMEZONE')?.trim() || 'UTC');
    return {
      id: event.id,
      title: event.title?.trim() || 'Appointment',
      startTime: this.normalizeEventTime(event.startTime, tz),
      endTime: this.normalizeEventTime(event.endTime, tz),
      contactId: event.contactId,
      calendarId: event.calendarId,
      status: event.appointmentStatus,
    };
  }

  /**
   * GHL may return epoch ms, ISO with offset, or naive ISO (UTC wall clock without Z).
   * Normalize to ISO with offset in the calendar timezone for consistent client display.
   */
  private normalizeEventTime(value: unknown, timeZone: string): string | undefined {
    if (value == null) return undefined;

    if (typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      if (typeof record.date === 'string') return this.normalizeEventTime(record.date, timeZone);
      if (typeof record.value === 'string') return this.normalizeEventTime(record.value, timeZone);
      if (typeof record.iso === 'string') return this.normalizeEventTime(record.iso, timeZone);
    }

    let epochMs: number | undefined;
    if (typeof value === 'number') {
      epochMs = value < 1e12 ? value * 1000 : value;
    } else {
      const raw = String(value).trim();
      if (!raw) return undefined;
      if (/^\d{10,13}$/.test(raw)) {
        const n = Number(raw);
        epochMs = raw.length <= 10 ? n * 1000 : n;
      } else if (/[+-]\d{2}:\d{2}$/i.test(raw) || /[+-]\d{4}$/.test(raw)) {
        const parsed = Date.parse(raw);
        if (!Number.isNaN(parsed)) epochMs = parsed;
        else return raw;
      } else if (/Z$/i.test(raw)) {
        const parsed = Date.parse(raw);
        if (!Number.isNaN(parsed)) epochMs = parsed;
        else return raw;
      } else if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
        // Naive datetime from GHL — treat as UTC, then format in calendar TZ.
        const parsed = Date.parse(raw.endsWith('Z') ? raw : `${raw}Z`);
        epochMs = Number.isNaN(parsed) ? Date.parse(raw) : parsed;
      } else {
        const parsed = Date.parse(raw);
        if (!Number.isNaN(parsed)) epochMs = parsed;
        else return raw;
      }
    }

    if (epochMs == null || Number.isNaN(epochMs)) return undefined;
    return this.formatGhlDateTime(epochMs, timeZone);
  }

  private appointmentSortKey(appointment: GhlAppointmentSummary): number {
    if (!appointment.startTime) return Number.MAX_SAFE_INTEGER;
    const time = Date.parse(appointment.startTime);
    return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
  }

  /** GHL may return scopes space- or comma-separated, or as one combined DB element. */
  private parseScopes(scope?: string): string[] {
    return (scope ?? '')
      .split(/[\s,]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  private normalizeScopes(scopes: string[]): string[] {
    return [...new Set(scopes.flatMap((entry) => this.parseScopes(entry)))];
  }

  /** Persist scopes from token + prior row; GHL often omits calendar scopes in the scope field. */
  private resolveStoredScopes(tokenScope?: string, previous?: string[]): string[] {
    const fromToken = this.parseScopes(tokenScope);
    const merged = new Set([
      ...fromToken,
      ...this.normalizeScopes(previous ?? []),
      ...this.getConfiguredScopes(),
    ]);
    return [...merged];
  }

  private hasCalendarScopes(scopes: string[] | undefined): boolean {
    if (!scopes?.length) return false;
    return this.normalizeScopes(scopes).some(
      (scope) =>
        scope === 'calendars.readonly' ||
        scope === 'calendars/events.readonly' ||
        scope.startsWith('calendars.'),
    );
  }

  private hasOpportunityScopes(scopes: string[] | undefined): boolean {
    if (!scopes?.length) return false;
    return this.normalizeScopes(scopes).some(
      (scope) =>
        scope === 'opportunities.readonly' ||
        scope === 'opportunities.write' ||
        scope.startsWith('opportunities.'),
    );
  }

  private calendarReconnectMessage(): string {
    return (
      'Your GoHighLevel connection does not include calendar access. ' +
      'Go to Profile → Settings → Reconnect GoHighLevel so the app can request calendar scopes. ' +
      'Ensure backend GHL_SCOPES includes calendars.readonly and calendars/events.* scopes, then restart the server.'
    );
  }

  private opportunityReconnectMessage(): string {
    return (
      'Your GoHighLevel connection does not include opportunities access. ' +
      'Go to Profile → Settings → Reconnect GoHighLevel so the app can request opportunity scopes. ' +
      'Ensure backend GHL_SCOPES includes opportunities.readonly and opportunities.write, then restart the server.'
    );
  }

  private async requireOpportunityScopes(userId: string): Promise<void> {
    const row = await this.prisma.integrationConnection.findUnique({
      where: { userId_provider: { userId, provider: CrmProvider.GHL } },
    });
    if (!row || !row.enabled) {
      throw new ForbiddenException('GHL is not connected');
    }
    if (!this.hasOpportunityScopes(row.scopes)) {
      throw new BadRequestException(this.opportunityReconnectMessage());
    }
  }

  private throwGhlHttpError(status: number, text: string, path?: string): never {
    const message = this.extractGhlError(text);
    if (status === 401 && /not authorized for this scope/i.test(message)) {
      throw new ForbiddenException(this.scopeMismatchMessage(path));
    }
    if (status === 403 && /scope/i.test(message)) {
      throw new ForbiddenException(this.scopeMismatchMessage(path));
    }
    if (status === 401) {
      throw new UnauthorizedException('GHL session expired — please reconnect in Profile');
    }
    if (status === 422 && /invalid slot range/i.test(message)) {
      throw new BadRequestException(
        'That time is not a valid booking slot for this calendar. Try asking for free slots first, or pick a time that matches your calendar interval.',
      );
    }
    throw new BadRequestException(`GHL API error (${status}): ${message}`);
  }

  /**
   * Picks the right "reconnect with these scopes" message based on which API
   * surface the failing request hit. GHL returns the same generic "not
   * authorized for this scope" error for every kind of scope mismatch, so the
   * path is the only signal we have.
   */
  private scopeMismatchMessage(path?: string): string {
    if (!path) return this.genericReconnectMessage();
    if (/^\/opportunities(\b|\/|\?)/.test(path) || /pipelines/i.test(path)) {
      return this.opportunityReconnectMessage();
    }
    if (/^\/calendars(\b|\/|\?)/.test(path)) {
      return this.calendarReconnectMessage();
    }
    if (/^\/contacts(\b|\/|\?)/.test(path)) {
      return this.contactsReconnectMessage();
    }
    return this.genericReconnectMessage();
  }

  private contactsReconnectMessage(): string {
    return (
      'Your GoHighLevel connection does not include contact access. ' +
      'Go to Profile → Settings → Reconnect GoHighLevel so the app can request contact scopes. ' +
      'Ensure backend GHL_SCOPES includes contacts.readonly and contacts.write, then restart the server.'
    );
  }

  private genericReconnectMessage(): string {
    return (
      'Your GoHighLevel connection is missing a scope this action needs. ' +
      'Go to Profile → Settings → Reconnect GoHighLevel and approve all the requested permissions, then try again.'
    );
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
