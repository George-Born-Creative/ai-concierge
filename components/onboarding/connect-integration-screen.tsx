import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ApiError } from '@/lib/api/client';
import { ghlApi } from '@/lib/api';
import { refreshSubscription } from '@/lib/api/payment';
import { useToast } from '@/lib/toast';

type CrmProvider = 'ghl' | 'hubspot';

type IntegrationCard = {
  id: CrmProvider;
  name: string;
  description: string;
  icon: keyof typeof MaterialIcons.glyphMap;
};

// One-shot retry: if the backend says we need an active subscription, the
// local row is probably still INCOMPLETE because the Stripe webhook hasn't
// landed. Force a refresh from Stripe and try again.
async function fetchAuthUrlWithRetry() {
  try {
    return await ghlApi.getAuthUrl();
  } catch (err) {
    const looksLikeSubscriptionGuard =
      err instanceof ApiError &&
      err.status === 403 &&
      /subscription/i.test(err.message ?? '');
    if (!looksLikeSubscriptionGuard) throw err;
    await refreshSubscription();
    return ghlApi.getAuthUrl();
  }
}

const INTEGRATIONS: Record<CrmProvider, IntegrationCard> = {
  ghl: {
    id: 'ghl',
    name: 'GoHighLevel',
    description:
      'Sync contacts, opportunities, notes, tasks, and trigger workflows from voice commands.',
    icon: 'hub',
  },
  hubspot: {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Create contacts and deals, add notes, and manage your pipeline from voice.',
    icon: 'cloud',
  },
};

export function ConnectIntegrationScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { provider } = useLocalSearchParams<{ provider?: CrmProvider }>();

  // Per client spec: one subscription = one CRM. Show only the
  // integration the user paid for. Default to GHL if missing.
  const activeProvider: CrmProvider =
    provider === 'hubspot' ? 'hubspot' : provider === 'ghl' ? 'ghl' : 'ghl';
  const integration = INTEGRATIONS[activeProvider];

  const [submitting, setSubmitting] = useState(false);

  async function startConnect() {
    if (activeProvider === 'hubspot') {
      show('HubSpot OAuth is coming in the next release.', 'info');
      return;
    }

    setSubmitting(true);
    try {
      const { url } = await fetchAuthUrlWithRetry();
      // Becomes aiconcierge://oauth/ghl — matches the deep link the backend
      // sends from the OAuth callback HTML.
      const returnUrl = Linking.createURL('oauth/ghl');

      const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
      if (result.type !== 'success') {
        // User dismissed the browser sheet — silent no-op.
        return;
      }

      const params = new URL(result.url).searchParams;
      if (params.get('status') !== 'ok') {
        const reason = params.get('reason');
        show(reason ? `Connection failed: ${reason}` : 'Connection failed.', 'error');
        return;
      }

      // Belt-and-suspenders: verify the row actually landed in the DB before
      // moving the user forward.
      const status = await ghlApi.getStatus();
      if (!status.connected) {
        show('Connection was not saved. Please try again.', 'error');
        return;
      }

      show(`${integration.name} connected.`, 'success');
      router.push({ pathname: '/openai-key', params: { provider: integration.id } });
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

        <View style={styles.integrationCard}>
          <View style={styles.integrationIcon}>
            <MaterialIcons name={integration.icon} size={26} color="#1A73E8" />
          </View>
          <View style={styles.integrationCopy}>
            <Text style={styles.integrationTitle}>{integration.name}</Text>
            <Text style={styles.integrationDescription}>{integration.description}</Text>
          </View>
        </View>

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

        <Text style={styles.helperText}>
          You can disconnect or switch your CRM later from the Profile tab. Switching CRMs may
          require a new subscription.
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
