import { apiRequest } from './client';
import type {
  GHLConnectRequest,
  GHLConnectResponse,
  IntegrationStatus,
  OAuthStartResponse,
} from './types';

// All direct GHL API access is now done by the backend through the
// unified CRM adapter. The mobile app only drives the OAuth handshake
// and reads/writes connection status.

export async function getGHLAuthUrl(token: string): Promise<OAuthStartResponse> {
  return apiRequest<OAuthStartResponse>('/integrations/ghl/auth-url', { token });
}

export async function connectGHL(data: GHLConnectRequest, token: string): Promise<GHLConnectResponse> {
  return apiRequest<GHLConnectResponse>('/integrations/ghl/callback', {
    method: 'POST',
    body: data,
    token,
  });
}

export async function getGHLStatus(token: string): Promise<IntegrationStatus> {
  return apiRequest<IntegrationStatus>('/integrations/ghl/status', { token });
}

export async function disconnectGHL(token: string): Promise<void> {
  return apiRequest<void>('/integrations/ghl/disconnect', { method: 'POST', token });
}
