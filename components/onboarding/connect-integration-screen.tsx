import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getMe } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { ghlApi, hubspotApi } from '@/lib/api';
import { refreshSubscription } from '@/lib/api/payment';
import type { GhlStatusResponse, HubspotStatusResponse } from '@/lib/api/types';
import { getOAuthReturnUrl, parseOAuthReturnUrl } from '@/lib/oauth-return-url';
import { refreshUser } from '@/lib/session';
import { useToast } from '@/lib/toast';

type CrmProvider = 'ghl' | 'hubspot';

type CrmOAuthClient = {
  getAuthUrl: (returnUrl: string) => Promise<{ url: string; state: string }>;
  getStatus: () => Promise<GhlStatusResponse | HubspotStatusResponse>;
};

type IntegrationCard = {
  id: CrmProvider;
  name: string;
  description: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  api: CrmOAuthClient;
};

const INTEGRATIONS: Record<CrmProvider, IntegrationCard> = {
  ghl: {
    id: 'ghl',
    name: 'GoHighLevel',
    description:
      'Sync contacts, opportunities, notes, tasks, and trigger workflows from voice commands.',
    icon: 'hub',
    api: ghlApi,
  },
  hubspot: {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Create contacts and deals, add notes, and manage your pipeline from voice.',
    icon: 'cloud',
    api: hubspotApi,
  },
};

WebBrowser.maybeCompleteAuthSession();

async function fetchAuthUrlWithRetry(api: CrmOAuthClient, returnUrl: string) {
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

export function ConnectIntegrationScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { provider, oauthStatus, oauthReason } = useLocalSearchParams<{
    provider?: CrmProvider;
    oauthStatus?: string;
    oauthReason?: string;
  }>();
  const oauthHandled = useRef(false);

  const activeProvider: CrmProvider =
    provider === 'hubspot' ? 'hubspot' : provider === 'ghl' ? 'ghl' : 'ghl';
  const integration = INTEGRATIONS[activeProvider];

  const [submitting, setSubmitting] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [connected, setConnected] = useState(false);
  const [connectionDetail, setConnectionDetail] = useState<string | null>(null);

  const loadConnectionStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const status = await integration.api.getStatus();
      setConnected(status.connected);
      if (status.connected) {
        const detail =
          'locationId' in status && status.locationId
            ? `Location ${status.locationId}`
            : 'portalId' in status && status.portalId
              ? `Portal ${status.portalId}`
              : 'Saved in your account';
        setConnectionDetail(detail);
      } else {
        setConnectionDetail(null);
      }
    } catch {
      setConnected(false);
      setConnectionDetail(null);
    } finally {
      setLoadingStatus(false);
    }
  }, [integration.api]);

  useFocusEffect(
    useCallback(() => {
      void loadConnectionStatus();
    }, [loadConnectionStatus]),
  );

  const applyConnectedState = useCallback(async () => {
    const status = await integration.api.getStatus();
    if (!status.connected) return false;

    try {
      const me = await getMe();
      await refreshUser(me);
    } catch {
      // Non-fatal if profile refresh fails.
    }

    await loadConnectionStatus();
    show(`${integration.name} connected and saved.`, 'success');
    return true;
  }, [integration.api, integration.name, loadConnectionStatus, show]);

  const finishOAuthReturn = useCallback(
    async (returnUrl: string) => {
      const parsed = parseOAuthReturnUrl(returnUrl);
      if (!parsed || parsed.provider !== activeProvider) return false;

      if (parsed.status !== 'ok') {
        show(
          parsed.reason ? `Connection failed: ${parsed.reason}` : 'Connection failed.',
          'error',
        );
        return true;
      }

      const ok = await applyConnectedState();
      if (!ok) {
        show('Connection was not saved. Please try again.', 'error');
      }
      return true;
    },
    [activeProvider, applyConnectedState, show],
  );

  /** When the browser closes without a deep link, tokens may still be saved on the server. */
  const syncAfterBrowser = useCallback(async () => {
    const ok = await applyConnectedState();
    if (ok) return;
    await loadConnectionStatus();
  }, [applyConnectedState, loadConnectionStatus]);

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

  useEffect(() => {
    const handleUrl = (event: { url: string }) => {
      const parsed = parseOAuthReturnUrl(event.url);
      if (!parsed || parsed.provider !== activeProvider) return;
      void finishOAuthReturn(event.url);
    };

    const subscription = Linking.addEventListener('url', handleUrl);
    void Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    return () => subscription.remove();
  }, [activeProvider, finishOAuthReturn]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void syncAfterBrowser();
    });
    return () => sub.remove();
  }, [syncAfterBrowser]);

  async function startConnect() {
    setSubmitting(true);
    try {
      const returnUrl = getOAuthReturnUrl(activeProvider);
      const { url } = await fetchAuthUrlWithRetry(integration.api, returnUrl);

      const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);

      if (result.type === 'success') {
        const handled = await finishOAuthReturn(result.url);
        if (!handled) {
          await syncAfterBrowser();
        }
      } else {
        // User closed the browser or deep link did not fire — still check the DB.
        await syncAfterBrowser();
      }
    } catch (err) {
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
  }

  function continueToOpenAIKey() {
    router.replace({ pathname: '/openai-key', params: { provider: integration.id } });
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.backButton} onPress={() => router.replace('/plan')}>
          <MaterialIcons name="arrow-back" size={22} color="#202124" />
        </Pressable>

        <View style={styles.headerIcon}>
          <MaterialIcons name="lan" size={34} color="#1A73E8" />
        </View>
        <Text style={styles.title}>Connect {integration.name}</Text>
        <Text style={styles.subtitle}>
          Your plan unlocks {integration.name}. We use OAuth to connect securely so you never have
          to paste any API keys.
        </Text>

        {loadingStatus ? (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color="#1A73E8" />
            <Text style={styles.statusText}>Checking connection…</Text>
          </View>
        ) : connected ? (
          <View style={styles.connectedBanner}>
            <MaterialIcons name="check-circle" size={22} color="#137333" />
            <View style={styles.connectedCopy}>
              <Text style={styles.connectedTitle}>Connected</Text>
              <Text style={styles.connectedSubtitle}>
                Tokens are stored securely on the server. {connectionDetail}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.integrationCard}>
          <View style={styles.integrationIcon}>
            <MaterialIcons name={integration.icon} size={26} color="#1A73E8" />
          </View>
          <View style={styles.integrationCopy}>
            <Text style={styles.integrationTitle}>{integration.name}</Text>
            <Text style={styles.integrationDescription}>{integration.description}</Text>
          </View>
        </View>

        {connected ? (
          <Pressable style={styles.primaryButton} onPress={continueToOpenAIKey}>
            <MaterialIcons name="arrow-forward" size={22} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Continue to OpenAI key</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
            onPress={startConnect}
            disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <MaterialIcons name="link" size={22} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Connect with OAuth</Text>
              </>
            )}
          </Pressable>
        )}

        <Text style={styles.helperText}>
          After you approve in GoHighLevel, you will see a success page in the browser, then return
          here automatically. You can disconnect later from Profile.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFF',
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: 24,
    paddingBottom: 42,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 14,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginBottom: 22,
    width: 44,
  },
  headerIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  title: {
    color: '#202124',
    fontSize: 34,
    fontWeight: '600',
    letterSpacing: -1,
    marginTop: 22,
  },
  subtitle: {
    color: '#5F6368',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  statusText: {
    color: '#5F6368',
    fontSize: 14,
  },
  connectedBanner: {
    alignItems: 'flex-start',
    backgroundColor: '#E6F4EA',
    borderColor: '#CEEAD6',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    padding: 14,
  },
  connectedCopy: {
    flex: 1,
  },
  connectedTitle: {
    color: '#137333',
    fontSize: 16,
    fontWeight: '600',
  },
  connectedSubtitle: {
    color: '#137333',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  integrationCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    marginTop: 28,
    padding: 16,
  },
  integrationIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  integrationCopy: {
    flex: 1,
  },
  integrationTitle: {
    color: '#202124',
    fontSize: 18,
    fontWeight: '600',
  },
  integrationDescription: {
    color: '#5F6368',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 22,
    minHeight: 58,
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  helperText: {
    color: '#5F6368',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 18,
    textAlign: 'center',
  },
});
