import { apiRequest } from './client';
import type { GhlAuthUrlResponse, GhlStatusResponse } from './types';

// Returns the GHL OAuth URL the app should open in an in-app browser session.
// Requires an active subscription on the backend.
export async function getAuthUrl(): Promise<GhlAuthUrlResponse> {
  return apiRequest<GhlAuthUrlResponse>('/integrations/ghl/auth-url');
}

export async function getStatus(): Promise<GhlStatusResponse> {
  return apiRequest<GhlStatusResponse>('/integrations/ghl/status');
}

export async function disconnect(): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>('/integrations/ghl/disconnect', {
    method: 'POST',
  });
}
