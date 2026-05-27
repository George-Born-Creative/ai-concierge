import { apiRequest } from './client';
import type {
  CreateGhlContactRequest,
  GhlAuthUrlResponse,
  GhlContactSummary,
  GhlContactsListResponse,
  GhlStatusResponse,
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
