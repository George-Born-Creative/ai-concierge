import { apiRequest } from './client';
import type {
  HubSpotConnectRequest,
  HubSpotConnectResponse,
  IntegrationStatus,
  OAuthStartResponse,
} from './types';

// All direct HubSpot API access is done by the backend through the
// unified CRM adapter. The mobile app only drives the OAuth handshake
// and reads/writes connection status.

export async function getHubSpotAuthUrl(token: string): Promise<OAuthStartResponse> {
  return apiRequest<OAuthStartResponse>('/integrations/hubspot/auth-url', { token });
}

export async function connectHubSpot(
  data: HubSpotConnectRequest,
  token: string
): Promise<HubSpotConnectResponse> {
  return apiRequest<HubSpotConnectResponse>('/integrations/hubspot/callback', {
    method: 'POST',
    body: data,
    token,
  });
}

export async function getHubSpotStatus(token: string): Promise<IntegrationStatus> {
  return apiRequest<IntegrationStatus>('/integrations/hubspot/status', { token });
}

export async function disconnectHubSpot(token: string): Promise<void> {
  return apiRequest<void>('/integrations/hubspot/disconnect', { method: 'POST', token });
}
