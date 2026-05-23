import { getToken } from '../session';

import { getApiBaseUrl } from './base-url';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  // Explicit token overrides the active session token. Pass `null` to skip
  // sending any auth header (e.g. on /auth/signin).
  token?: string | null;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;

  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new ApiError(0, 'API URL is not set. For production, set EXPO_PUBLIC_API_BASE_URL.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const authToken = token === undefined ? getToken() : token;
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const contentType = response.headers.get('content-type') ?? '';

  if (!response.ok) {
    const message = await extractErrorMessage(response, contentType);
    throw new ApiError(response.status, message);
  }

  if (contentType.includes('application/json')) {
    return response.json() as Promise<T>;
  }

  const text = await response.text().catch(() => '');
  if (looksLikeHtml(text)) {
    throw new ApiError(
      0,
      'API returned a web page instead of JSON. Set EXPO_PUBLIC_API_BASE_URL to your Nest server (not the marketing site).',
    );
  }

  return null as T;
}

function looksLikeHtml(text: string): boolean {
  const t = text.trimStart().toLowerCase();
  return t.startsWith('<!doctype') || t.startsWith('<html');
}

// NestJS returns error bodies like { statusCode, message, error }. Extract a
// readable message; class-validator wraps `message` in an array of strings.
async function extractErrorMessage(
  response: Response,
  contentType: string,
): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return `Request failed with status ${response.status}`;

  if (!contentType.includes('application/json') && looksLikeHtml(text)) {
    if (response.status === 404) {
      return 'API route not found. EXPO_PUBLIC_API_BASE_URL may point at the wrong host (use your Nest backend URL, not the marketing website).';
    }
    return 'Server returned a web page instead of JSON. Check EXPO_PUBLIC_API_BASE_URL.';
  }

  try {
    const body = JSON.parse(text);
    if (Array.isArray(body?.message)) return body.message.join(', ');
    if (typeof body?.message === 'string') return body.message;
    if (typeof body?.error === 'string') return body.error;
  } catch {
    // not JSON — fall through to raw text
  }
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}
