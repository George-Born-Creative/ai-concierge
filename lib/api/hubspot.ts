import { apiRequest } from './client';
import type { HubspotAuthUrlResponse, HubspotStatusResponse } from './types';

// Returns the HubSpot OAuth URL the app should open in an in-app browser
// session. Requires an active HubSpot subscription on the backend.
export async function getAuthUrl(returnUrl?: string): Promise<HubspotAuthUrlResponse> {
  const path = returnUrl
    ? `/integrations/hubspot/auth-url?${new URLSearchParams({ returnUrl })}`
    : '/integrations/hubspot/auth-url';
  return apiRequest<HubspotAuthUrlResponse>(path);
}

export async function getStatus(): Promise<HubspotStatusResponse> {
  return apiRequest<HubspotStatusResponse>('/integrations/hubspot/status');
}

export async function disconnect(): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>('/integrations/hubspot/disconnect', {
    method: 'POST',
  });
}
