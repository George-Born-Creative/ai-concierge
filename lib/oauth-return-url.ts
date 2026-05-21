import * as Linking from 'expo-linking';

/** Must match `scheme` in app.json and `APP_DEEP_LINK_SCHEME` in backend/.env */
export const APP_DEEP_LINK_SCHEME = 'aiconcierge';

export type OAuthProvider = 'ghl' | 'hubspot';

/**
 * Deep link the in-app browser waits for after OAuth.
 * Uses the app scheme so it works in dev builds; Expo Go may use exp:// — both are allowed by the backend.
 */
export function getOAuthReturnUrl(provider: OAuthProvider): string {
  return Linking.createURL(`oauth/${provider}`, { scheme: APP_DEEP_LINK_SCHEME });
}

export function parseOAuthReturnUrl(
  url: string,
): { provider: OAuthProvider; status: string; reason: string | null } | null {
  const providerMatch = url.match(/\/oauth\/(ghl|hubspot)(?:\?|$|\/)/i);
  if (!providerMatch) return null;
  const provider = providerMatch[1].toLowerCase() as OAuthProvider;
  if (provider !== 'ghl' && provider !== 'hubspot') return null;

  try {
    const parsed = new URL(url);
    return {
      provider,
      status: parsed.searchParams.get('status') ?? '',
      reason: parsed.searchParams.get('reason'),
    };
  } catch {
    const q = url.indexOf('?');
    if (q === -1) return { provider, status: '', reason: null };
    const params = new URLSearchParams(url.slice(q + 1));
    return {
      provider,
      status: params.get('status') ?? '',
      reason: params.get('reason'),
    };
  }
}
