import { ApiError } from './api-error';

export function toNetworkApiError(err: unknown, baseUrl: string): ApiError {
  const target = baseUrl || '(API URL not set)';

  if (err instanceof ApiError) {
    return err;
  }

  const message = err instanceof Error ? err.message : String(err);
  const isNetworkFailure =
    err instanceof TypeError ||
    /network request failed|failed to fetch|network error|unable to resolve host/i.test(message);

  if (isNetworkFailure) {
    const metroHint =
      __DEV__ && baseUrl.includes('192.168.137.1')
        ? ' Your phone may be on Wi‑Fi, not PC hotspot — restart Expo (npx expo start -c) so the app uses the Expo QR IP.'
        : '';
    return new ApiError(
      0,
      `Cannot reach ${target}. Backend may be running but Windows Firewall often blocks port 4000 (Metro uses 8081). Run scripts/allow-backend-port.ps1 as Administrator, then open ${target.replace(/\/$/, '')}/health on your phone.${metroHint}`,
    );
  }

  return new ApiError(0, message || 'Request failed');
}
