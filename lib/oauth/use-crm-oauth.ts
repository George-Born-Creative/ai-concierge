import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { getMe } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { refreshSubscription } from '@/lib/api/payment';
import type { GhlStatusResponse, HubspotStatusResponse } from '@/lib/api/types';
import { refreshUser } from '@/lib/session';

import {
  getOAuthReturnUrl,
  isOAuthReturnUrl,
  parseOAuthReturnUrl,
  type OAuthProvider,
} from './deep-link';

WebBrowser.maybeCompleteAuthSession();

export type CrmOAuthApi = {
  getAuthUrl: (returnUrl: string) => Promise<{ url: string; state: string }>;
  getStatus: () => Promise<GhlStatusResponse | HubspotStatusResponse>;
};

type ToastFn = (message: string, type: 'success' | 'error' | 'info') => void;

type UseCrmOAuthOptions = {
  provider: OAuthProvider;
  api: CrmOAuthApi;
  integrationName: string;
  oauthStatus?: string;
  oauthReason?: string;
  show: ToastFn;
  onStatusChange: (connected: boolean, detail: string | null) => void;
  setLoadingStatus: (loading: boolean) => void;
  setSubmitting: (submitting: boolean) => void;
};

async function fetchAuthUrlWithRetry(api: CrmOAuthApi, returnUrl: string) {
  try {
    return await api.getAuthUrl(returnUrl);
  } catch (err) {
    const looksLikeSubscriptionGuard =
      err instanceof ApiError &&
      err.status === 403 &&
      /subscription/i.test(err.message ?? '');
    if (!looksLikeSubscriptionGuard) throw err;
    await refreshSubscription();
    return api.getAuthUrl(returnUrl);
  }
}

/**
 * GHL / HubSpot OAuth + deep link handling for the Connect onboarding screen.
 *
 * Flow:
 * 1. GET /integrations/{provider}/auth-url?returnUrl=<deep link>
 * 2. WebBrowser → GHL authorize → backend redirect page → /finish → deep link ?status=ok
 * 3. app/oauth/[provider] or Linking listener → verify GET /status → refresh profile
 */
export function useCrmOAuth({
  provider,
  api,
  integrationName,
  oauthStatus,
  oauthReason,
  show,
  onStatusChange,
  setLoadingStatus,
  setSubmitting,
}: UseCrmOAuthOptions) {
  const oauthHandled = useRef(false);
  const oauthSessionActive = useRef(false);

  const loadConnectionStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const status = await api.getStatus();
      const detail = status.connected
        ? 'locationId' in status && status.locationId
          ? `Location ${status.locationId}`
          : 'portalId' in status && status.portalId
            ? `Portal ${status.portalId}`
            : 'Saved in your account'
        : null;
      onStatusChange(status.connected, detail);
    } catch {
      onStatusChange(false, null);
    } finally {
      setLoadingStatus(false);
    }
  }, [api, onStatusChange, setLoadingStatus]);

  const applyConnectedState = useCallback(async () => {
    try {
      const status = await api.getStatus();
      if (!status.connected) return false;

      try {
        const me = await getMe();
        await refreshUser(me);
      } catch {
        // Profile refresh is best-effort after OAuth.
      }

      await loadConnectionStatus();
      show(`${integrationName} connected and saved.`, 'success');
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        show(err.message, 'error');
      }
      return false;
    }
  }, [api, integrationName, loadConnectionStatus, show]);

  const finishOAuthReturn = useCallback(
    async (returnUrl: string) => {
      const parsed = parseOAuthReturnUrl(returnUrl);
      if (!parsed || parsed.provider !== provider) return false;

      oauthSessionActive.current = false;

      if (parsed.status === 'error') {
        show(
          parsed.reason ? `Connection failed: ${parsed.reason}` : 'Connection failed.',
          'error',
        );
        return true;
      }

      if (parsed.status !== 'ok') return false;

      const ok = await applyConnectedState();
      if (!ok) {
        show('Connection was not saved. Please try again.', 'error');
      }
      return true;
    },
    [applyConnectedState, provider, show],
  );

  const syncAfterBrowser = useCallback(async () => {
    if (!oauthSessionActive.current) return;
    oauthSessionActive.current = false;
    const ok = await applyConnectedState();
    if (!ok) await loadConnectionStatus();
  }, [applyConnectedState, loadConnectionStatus]);

  const startOAuthConnect = useCallback(async () => {
    setSubmitting(true);
    oauthSessionActive.current = true;
    try {
      const returnUrl = getOAuthReturnUrl(provider);
      const { url } = await fetchAuthUrlWithRetry(api, returnUrl);

      const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);

      if (result.type === 'success' && result.url) {
        const handled = await finishOAuthReturn(result.url);
        if (!handled) await syncAfterBrowser();
      } else {
        await syncAfterBrowser();
      }
    } catch (err) {
      oauthSessionActive.current = false;
      const message =
        err instanceof ApiError
          ? err.message || 'Could not start the connection. Please try again.'
          : err instanceof Error
            ? err.message
            : 'Could not start the connection. Please try again.';
      show(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }, [api, finishOAuthReturn, provider, setSubmitting, show, syncAfterBrowser]);

  // Deep link query params from app/oauth/[provider] → /connect
  useEffect(() => {
    if (!oauthStatus || oauthHandled.current) return;
    oauthHandled.current = true;
    if (oauthStatus === 'ok') {
      void applyConnectedState();
    } else if (oauthStatus === 'error') {
      show(
        oauthReason ? `Connection failed: ${oauthReason}` : 'Connection failed.',
        'error',
      );
    }
  }, [applyConnectedState, oauthReason, oauthStatus, show]);

  // aiconcierge://oauth/ghl?status=ok (or exp:// in Expo Go)
  useEffect(() => {
    const handleUrl = (event: { url: string }) => {
      if (!isOAuthReturnUrl(event.url, provider)) return;
      void finishOAuthReturn(event.url);
    };

    const subscription = Linking.addEventListener('url', handleUrl);
    void Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    return () => subscription.remove();
  }, [finishOAuthReturn, provider]);

  // Fallback when the browser closes without firing the deep link
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void syncAfterBrowser();
    });
    return () => sub.remove();
  }, [syncAfterBrowser]);

  return { loadConnectionStatus, startOAuthConnect };
}
