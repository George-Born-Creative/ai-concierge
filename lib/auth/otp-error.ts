import { ApiError } from '@/lib/api/client';

export function getOtpErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error && error.message
      ? error.message
      : fallback;
  }

  if (error.status === 401) {
    return 'Your session expired. Sign in and request a new code.';
  }
  if (error.status === 429) {
    return 'Too many verification attempts. Please wait before trying again.';
  }
  if (error.status === 0) {
    return error.message || 'Cannot reach the server. Check your connection.';
  }

  return error.message || fallback;
}
