import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PageHeader } from '@/components/page-header';
import { ScreenShell } from '@/components/screen';
import { ghlApi, hubspotApi } from '@/lib/api';
import { CRM_LABELS } from '@/lib/crm/labels';
import { useCrmOAuth, type CrmOAuthApi, type OAuthProvider } from '@/lib/oauth';
import { useToast } from '@/lib/toast';

type IntegrationCard = {
  id: OAuthProvider;
  name: string;
  description: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  api: CrmOAuthApi;
};

const INTEGRATIONS: Record<OAuthProvider, IntegrationCard> = {
  ghl: {
    id: 'ghl',
    name: CRM_LABELS.ghl,
    description:
      'Sync contacts, opportunities, notes, tasks, and trigger workflows from voice commands.',
    icon: 'hub',
    api: ghlApi,
  },
  hubspot: {
    id: 'hubspot',
    name: CRM_LABELS.hubspot,
    description: 'Create contacts and deals, add notes, and manage your pipeline from voice.',
    icon: 'cloud',
    api: hubspotApi,
  },
};

export function ConnectIntegrationScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { provider, oauthStatus, oauthReason } = useLocalSearchParams<{
    provider?: OAuthProvider;
    oauthStatus?: string;
    oauthReason?: string;
  }>();

  const activeProvider: OAuthProvider =
    provider === 'hubspot' ? 'hubspot' : provider === 'ghl' ? 'ghl' : 'ghl';
  const integration = INTEGRATIONS[activeProvider];

  const [submitting, setSubmitting] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [connected, setConnected] = useState(false);
  const [connectionDetail, setConnectionDetail] = useState<string | null>(null);

  const onStatusChange = useCallback((isConnected: boolean, detail: string | null) => {
    setConnected(isConnected);
    setConnectionDetail(detail);
  }, []);

  const { loadConnectionStatus, startOAuthConnect } = useCrmOAuth({
    provider: activeProvider,
    api: integration.api,
    integrationName: integration.name,
    oauthStatus,
    oauthReason,
    show,
    onStatusChange,
    setLoadingStatus,
    setSubmitting,
  });

  useFocusEffect(
    useCallback(() => {
      void loadConnectionStatus();
    }, [loadConnectionStatus]),
  );

  function continueToOpenAIKey() {
    router.replace({ pathname: '/openai-key', params: { provider: integration.id } });
  }

  return (
    <ScreenShell>
      <PageHeader title={`Connect ${integration.name}`} showBack onBack={() => router.replace('/plan')} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
            onPress={startOAuthConnect}
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
          After you approve in {integration.name}, you will see a success page in the browser, then
          return here via aiconcierge://oauth/{integration.id}?status=ok. You can disconnect later
          from Profile.
        </Text>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 12,
    paddingTop: 24,
    paddingBottom: 42,
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
