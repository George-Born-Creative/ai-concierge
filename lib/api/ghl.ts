import { apiRequest } from './client';
import type {
  GHLConnectRequest,
  GHLConnectResponse,
  GHLContact,
  GHLContactsResponse,
  GHLOAuthStartResponse,
} from './types';

const GHL_API = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

// ─── OAuth ────────────────────────────────────────────────────────────────────

/**
 * Returns the GHL OAuth consent URL to open in a browser.
 * Your backend builds this URL so the client_id stays server-side.
 */
export async function getGHLAuthUrl(token: string): Promise<GHLOAuthStartResponse> {
  return apiRequest<GHLOAuthStartResponse>('/ghl/auth-url', { token });
}

/**
 * After the user approves on GHL, your backend callback exchanges the code
 * for tokens. Call this to mark the connection in your own DB.
 */
export async function connectGHL(data: GHLConnectRequest, token: string): Promise<GHLConnectResponse> {
  return apiRequest<GHLConnectResponse>('/ghl/connect', {
    method: 'POST',
    body: data,
    token,
  });
}

export async function disconnectGHL(token: string): Promise<void> {
  return apiRequest<void>('/ghl/disconnect', { method: 'POST', token });
}

// ─── Contacts (direct GHL API calls using stored access token) ────────────────

/**
 * Fetches contacts directly from GHL using the location's access token.
 * Pass the GHL access token retrieved from your backend.
 */
export async function getContacts(
  locationId: string,
  ghlAccessToken: string,
  page = 1
): Promise<GHLContactsResponse> {
  const url = `${GHL_API}/contacts/?locationId=${locationId}&page=${page}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${ghlAccessToken}`,
      Version: GHL_VERSION,
    },
  });

  if (!response.ok) {
    throw new Error(`GHL contacts error (${response.status})`);
  }

  return response.json() as Promise<GHLContactsResponse>;
}

export async function getContact(
  contactId: string,
  ghlAccessToken: string
): Promise<GHLContact> {
  const response = await fetch(`${GHL_API}/contacts/${contactId}`, {
    headers: {
      Authorization: `Bearer ${ghlAccessToken}`,
      Version: GHL_VERSION,
    },
  });

  if (!response.ok) throw new Error(`GHL contact error (${response.status})`);
  return response.json() as Promise<GHLContact>;
}

export async function createContact(
  locationId: string,
  data: Partial<GHLContact>,
  ghlAccessToken: string
): Promise<GHLContact> {
  const response = await fetch(`${GHL_API}/contacts/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ghlAccessToken}`,
      Version: GHL_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...data, locationId }),
  });

  if (!response.ok) throw new Error(`GHL create contact error (${response.status})`);
  return response.json() as Promise<GHLContact>;
}

export async function updateContact(
  contactId: string,
  data: Partial<GHLContact>,
  ghlAccessToken: string
): Promise<GHLContact> {
  const response = await fetch(`${GHL_API}/contacts/${contactId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${ghlAccessToken}`,
      Version: GHL_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) throw new Error(`GHL update contact error (${response.status})`);
  return response.json() as Promise<GHLContact>;
}

export async function deleteContact(
  contactId: string,
  ghlAccessToken: string
): Promise<void> {
  const response = await fetch(`${GHL_API}/contacts/${contactId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${ghlAccessToken}`,
      Version: GHL_VERSION,
    },
  });

  if (!response.ok) throw new Error(`GHL delete contact error (${response.status})`);
}
