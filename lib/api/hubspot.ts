import { apiRequest } from './client';
import type {
  HubspotAuthUrlResponse,
  HubspotCompanySummary,
  HubspotContactSummary,
  HubspotDealSummary,
  HubspotPaginated,
  HubspotStatusResponse,
  HubspotTicketSummary,
  ListHubspotParams,
  SearchHubspotContactsParams,
  SearchHubspotTicketsParams,
} from './types';

// ─── OAuth lifecycle ─────────────────────────────────────────────────────────

// Returns the HubSpot OAuth URL the app should open in an in-app browser
// session. `returnUrl` is required so the backend can route the redirect
// back to the right deep link (handles aiconcierge:// and Expo Go's exp://).
export async function getAuthUrl(returnUrl: string): Promise<HubspotAuthUrlResponse> {
  const q = new URLSearchParams({ returnUrl });
  return apiRequest<HubspotAuthUrlResponse>(
    `/integrations/hubspot/auth-url?${q.toString()}`,
  );
}

export async function getStatus(): Promise<HubspotStatusResponse> {
  return apiRequest<HubspotStatusResponse>('/integrations/hubspot/status');
}

export async function disconnect(): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>('/integrations/hubspot/disconnect', {
    method: 'POST',
  });
}

export async function reconnect(returnUrl: string): Promise<HubspotAuthUrlResponse> {
  const q = new URLSearchParams({ returnUrl });
  return apiRequest<HubspotAuthUrlResponse>(
    `/integrations/hubspot/reconnect?${q.toString()}`,
    { method: 'POST' },
  );
}

// ─── CRM: contacts ───────────────────────────────────────────────────────────

export async function listContacts(
  params?: ListHubspotParams,
): Promise<HubspotPaginated<HubspotContactSummary>> {
  return apiRequest<HubspotPaginated<HubspotContactSummary>>(
    withQuery('/integrations/hubspot/contacts', params),
  );
}

export async function searchContacts(
  params: SearchHubspotContactsParams,
): Promise<HubspotPaginated<HubspotContactSummary>> {
  return apiRequest<HubspotPaginated<HubspotContactSummary>>(
    withQuery('/integrations/hubspot/contacts/search', params),
  );
}

export async function getContact(id: string): Promise<HubspotContactSummary> {
  return apiRequest<HubspotContactSummary>(
    `/integrations/hubspot/contacts/${encodeURIComponent(id)}`,
  );
}

// ─── CRM: deals ──────────────────────────────────────────────────────────────

export async function listDeals(
  params?: ListHubspotParams,
): Promise<HubspotPaginated<HubspotDealSummary>> {
  return apiRequest<HubspotPaginated<HubspotDealSummary>>(
    withQuery('/integrations/hubspot/deals', params),
  );
}

export async function getDeal(id: string): Promise<HubspotDealSummary> {
  return apiRequest<HubspotDealSummary>(
    `/integrations/hubspot/deals/${encodeURIComponent(id)}`,
  );
}

// ─── CRM: companies ──────────────────────────────────────────────────────────

export async function listCompanies(
  params?: ListHubspotParams,
): Promise<HubspotPaginated<HubspotCompanySummary>> {
  return apiRequest<HubspotPaginated<HubspotCompanySummary>>(
    withQuery('/integrations/hubspot/companies', params),
  );
}

export async function getCompany(id: string): Promise<HubspotCompanySummary> {
  return apiRequest<HubspotCompanySummary>(
    `/integrations/hubspot/companies/${encodeURIComponent(id)}`,
  );
}

// ─── CRM: tickets ────────────────────────────────────────────────────────────

export async function listTickets(
  params?: ListHubspotParams,
): Promise<HubspotPaginated<HubspotTicketSummary>> {
  return apiRequest<HubspotPaginated<HubspotTicketSummary>>(
    withQuery('/integrations/hubspot/tickets', params),
  );
}

export async function searchTickets(
  params: SearchHubspotTicketsParams,
): Promise<HubspotPaginated<HubspotTicketSummary>> {
  return apiRequest<HubspotPaginated<HubspotTicketSummary>>(
    withQuery('/integrations/hubspot/tickets/search', params),
  );
}

export async function getTicket(id: string): Promise<HubspotTicketSummary> {
  return apiRequest<HubspotTicketSummary>(
    `/integrations/hubspot/tickets/${encodeURIComponent(id)}`,
  );
}

// ─── Internals ───────────────────────────────────────────────────────────────

function withQuery(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
): string {
  if (!params) return path;
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    q.set(key, String(value));
  }
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}
