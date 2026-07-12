import { apiRequest } from './client';
import type {
  CreateGhlAppointmentRequest,
  CreateGhlCalendarRequest,
  CreateGhlContactRequest,
  GhlAppointmentSummary,
  GhlAppointmentsListResponse,
  GhlAuthUrlResponse,
  GhlCalendarFreeSlotsParams,
  GhlCalendarFreeSlotsResponse,
  GhlCalendarSummary,
  GhlCalendarsListResponse,
  GhlContactSummary,
  GhlContactsListResponse,
  GhlOpportunitiesListResponse,
  GhlStatusResponse,
  ListGhlCalendarEventsParams,
  ListGhlOpportunitiesParams,
  UpdateGhlCalendarRequest,
} from './types';

// Returns the GHL OAuth URL the app should open in an in-app browser session.
// Requires an active subscription on the backend.
export async function getAuthUrl(returnUrl: string): Promise<GhlAuthUrlResponse> {
  const q = new URLSearchParams({ returnUrl });
  return apiRequest<GhlAuthUrlResponse>(`/integrations/ghl/auth-url?${q.toString()}`);
}

export async function getStatus(): Promise<GhlStatusResponse> {
  return apiRequest<GhlStatusResponse>('/integrations/ghl/status');
}

export async function disconnect(): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>('/integrations/ghl/disconnect', {
    method: 'POST',
  });
}

export async function reconnect(returnUrl: string): Promise<GhlAuthUrlResponse> {
  const q = new URLSearchParams({ returnUrl });
  return apiRequest<GhlAuthUrlResponse>(`/integrations/ghl/reconnect?${q.toString()}`, {
    method: 'POST',
  });
}

export async function listContacts(params?: {
  limit?: number;
  query?: string;
}): Promise<GhlContactsListResponse> {
  const q = new URLSearchParams();
  if (params?.limit) q.set('limit', String(params.limit));
  if (params?.query) q.set('query', params.query);
  const suffix = q.toString();
  return apiRequest<GhlContactsListResponse>(
    suffix ? `/integrations/ghl/contacts?${suffix}` : '/integrations/ghl/contacts',
  );
}

export async function createContact(body: CreateGhlContactRequest): Promise<GhlContactSummary> {
  return apiRequest<GhlContactSummary>('/integrations/ghl/contacts', {
    method: 'POST',
    body,
  });
}

export async function deleteContact(contactId: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>(`/integrations/ghl/contacts/${contactId}`, {
    method: 'DELETE',
  });
}

export async function listOpportunities(
  params?: ListGhlOpportunitiesParams,
): Promise<GhlOpportunitiesListResponse> {
  const q = new URLSearchParams();
  if (params?.limit) q.set('limit', String(params.limit));
  if (params?.query) q.set('query', params.query);
  if (params?.pipelineId) q.set('pipelineId', params.pipelineId);
  if (params?.status) q.set('status', params.status);
  const suffix = q.toString();
  return apiRequest<GhlOpportunitiesListResponse>(
    suffix
      ? `/integrations/ghl/opportunities?${suffix}`
      : '/integrations/ghl/opportunities',
  );
}

export async function listCalendars(): Promise<GhlCalendarsListResponse> {
  return apiRequest<GhlCalendarsListResponse>('/integrations/ghl/calendars');
}

export async function getCalendar(calendarId: string): Promise<GhlCalendarSummary> {
  return apiRequest<GhlCalendarSummary>(`/integrations/ghl/calendars/${calendarId}`);
}

export async function createCalendar(
  body: CreateGhlCalendarRequest,
): Promise<GhlCalendarSummary> {
  return apiRequest<GhlCalendarSummary>('/integrations/ghl/calendars', {
    method: 'POST',
    body,
  });
}

export async function updateCalendar(
  calendarId: string,
  body: UpdateGhlCalendarRequest,
): Promise<GhlCalendarSummary> {
  return apiRequest<GhlCalendarSummary>(`/integrations/ghl/calendars/${calendarId}`, {
    method: 'PUT',
    body,
  });
}

export async function deleteCalendar(calendarId: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>(`/integrations/ghl/calendars/${calendarId}`, {
    method: 'DELETE',
  });
}

export async function getCalendarFreeSlots(
  calendarId: string,
  params: GhlCalendarFreeSlotsParams,
): Promise<GhlCalendarFreeSlotsResponse> {
  const q = new URLSearchParams({
    startDate: String(params.startDate),
    endDate: String(params.endDate),
  });
  if (params.timezone) q.set('timezone', params.timezone);
  if (params.userId) q.set('userId', params.userId);
  return apiRequest<GhlCalendarFreeSlotsResponse>(
    `/integrations/ghl/calendars/${calendarId}/free-slots?${q.toString()}`,
  );
}

export async function listCalendarEvents(
  params?: ListGhlCalendarEventsParams,
): Promise<GhlAppointmentsListResponse> {
  const q = new URLSearchParams();
  if (params?.calendarId) q.set('calendarId', params.calendarId);
  if (params?.calendarName) q.set('calendarName', params.calendarName);
  if (params?.startTime) q.set('startTime', params.startTime);
  if (params?.endTime) q.set('endTime', params.endTime);
  if (params?.days) q.set('days', String(params.days));
  const suffix = q.toString();
  return apiRequest<GhlAppointmentsListResponse>(
    suffix ? `/integrations/ghl/calendar-events?${suffix}` : '/integrations/ghl/calendar-events',
  );
}

export async function createAppointment(
  body: CreateGhlAppointmentRequest,
): Promise<GhlAppointmentSummary> {
  return apiRequest<GhlAppointmentSummary>('/integrations/ghl/calendar-events', {
    method: 'POST',
    body,
  });
}

export async function cancelAppointment(eventId: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>(`/integrations/ghl/calendar-events/${eventId}`, {
    method: 'DELETE',
  });
}
