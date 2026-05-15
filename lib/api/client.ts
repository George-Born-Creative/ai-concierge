import { getToken } from '../session';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

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

  if (!BASE_URL) {
    throw new ApiError(0, 'EXPO_PUBLIC_API_BASE_URL is not set');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const authToken = token === undefined ? getToken() : token;
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    throw new ApiError(response.status, message);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json() as Promise<T>;
  }

  return null as T;
}

// NestJS returns error bodies like { statusCode, message, error }. Extract a
// readable message; class-validator wraps `message` in an array of strings.
async function extractErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return `Request failed with status ${response.status}`;
  try {
    const body = JSON.parse(text);
    if (Array.isArray(body?.message)) return body.message.join(', ');
    if (typeof body?.message === 'string') return body.message;
    if (typeof body?.error === 'string') return body.error;
  } catch {
    // not JSON — fall through to raw text
  }
  return text;
}
