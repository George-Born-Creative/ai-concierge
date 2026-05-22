import * as Linking from 'expo-linking';

/** Must match `scheme` in app.json and `APP_DEEP_LINK_SCHEME` in backend/.env */
export const APP_DEEP_LINK_SCHEME = 'aiconcierge';

export type OAuthProvider = 'ghl' | 'hubspot';

export type ParsedOAuthReturn = {
  provider: OAuthProvider;
  status: 'ok' | 'error' | '';
  reason: string | null;
};

/**
 * Deep link the in-app browser waits for after OAuth.
 * Dev client: aiconcierge://oauth/ghl?status=ok
 * Expo Go: exp://…/--/oauth/ghl?status=ok (allowed by backend returnUrl validation)
 */
export function getOAuthReturnUrl(provider: OAuthProvider): string {
  return Linking.createURL(`oauth/${provider}`, { scheme: APP_DEEP_LINK_SCHEME });
}

export function buildConnectRouteParams(
  provider: OAuthProvider,
  status?: string,
  reason?: string,
): { provider: OAuthProvider; oauthStatus?: string; oauthReason?: string } {
  const params: { provider: OAuthProvider; oauthStatus?: string; oauthReason?: string } = {
    provider,
  };
  if (status) params.oauthStatus = status;
  if (reason) params.oauthReason = reason;
  return params;
}

export function parseOAuthReturnUrl(url: string): ParsedOAuthReturn | null {
  const providerMatch = url.match(/\/oauth\/(ghl|hubspot)(?:\?|$|\/)/i);
  if (!providerMatch) return null;
  const provider = providerMatch[1].toLowerCase() as OAuthProvider;
  if (provider !== 'ghl' && provider !== 'hubspot') return null;

  let status = '';
  let reason: string | null = null;

  try {
    const parsed = new URL(url);
    status = parsed.searchParams.get('status') ?? '';
    reason = parsed.searchParams.get('reason');
  } catch {
    const q = url.indexOf('?');
    if (q !== -1) {
      const params = new URLSearchParams(url.slice(q + 1));
      status = params.get('status') ?? '';
      reason = params.get('reason');
    }
  }

  const normalized =
    status === 'ok' || status === 'error' ? (status as 'ok' | 'error') : ('' as const);

  return { provider, status: normalized, reason };
}

export function isOAuthReturnUrl(url: string, provider: OAuthProvider): boolean {
  const parsed = parseOAuthReturnUrl(url);
  return parsed?.provider === provider;
}
