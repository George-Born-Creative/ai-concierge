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
import {
  UiControlHeights,
  UiRadii,
  UiSpacing,
  UiTypography,
} from '@/constants/theme';
import { useAppTheme } from '@/lib/theme/theme-provider';
import { ghlApi, hubspotApi } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { CRM_LABELS } from '@/lib/crm/labels';
import {
  getOAuthReturnUrl,
  setOAuthReturnFrom,
  useCrmOAuth,
  type CrmOAuthApi,
  type OAuthProvider,
} from '@/lib/oauth';
import { useToast } from '@/lib/toast';

type IntegrationApi = CrmOAuthApi & {
  reconnect: (returnUrl: string) => Promise<{ url: string; state: string }>;
};

type IntegrationCard = {
  id: OAuthProvider;
  name: string;
  description: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  api: IntegrationApi;
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
  const { colors } = useAppTheme();
  const router = useRouter();
  const { show } = useToast();
  const { provider, oauthStatus, oauthReason, from, reconnect } = useLocalSearchParams<{
    provider?: OAuthProvider;
    oauthStatus?: string;
    oauthReason?: string;
    from?: string;
    reconnect?: string;
  }>();
  const fromCrm = from === 'crm';

  const activeProvider: OAuthProvider =
    provider === 'hubspot' ? 'hubspot' : provider === 'ghl' ? 'ghl' : 'ghl';
  const integration = INTEGRATIONS[activeProvider];

  const [submitting, setSubmitting] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [connected, setConnected] = useState(false);
  const [connectionDetail, setConnectionDetail] = useState<string | null>(null);
  const [reconnectPending, setReconnectPending] = useState(reconnect === '1');

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

  function continueAfterConnect() {
    if (fromCrm) {
      router.replace('/settings/crm');
      return;
    }
    router.replace({ pathname: '/openai-key', params: { provider: integration.id } });
  }

  async function handleStartConnect() {
    setOAuthReturnFrom(fromCrm ? 'crm' : null);
    if (reconnectPending) {
      try {
        setSubmitting(true);
        await integration.api.reconnect(getOAuthReturnUrl(activeProvider));
      } catch (err) {
        setSubmitting(false);
        const message =
          err instanceof ApiError
            ? err.message
            : `Could not start ${integration.name} reconnect.`;
        show(message, 'error');
        return;
      }
    }
    await startOAuthConnect();
    setReconnectPending(false);
  }

  return (
    <ScreenShell>
      <PageHeader
        title={`Connect ${integration.name}`}
        showBack
        onBack={() => router.replace(fromCrm ? '/settings/crm' : '/plan')}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
        overScrollMode="never">
        <View style={styles.headerIcon}>
          <MaterialIcons name="lan" size={28} color={colors.primary} />
        </View>
        <Text style={styles.title}>Connect {integration.name}</Text>
        <Text style={styles.subtitle}>
          Your plan unlocks {integration.name}. We use OAuth to connect securely so you never have
          to paste any API keys.
        </Text>

        {loadingStatus ? (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.statusText}>Checking connection…</Text>
          </View>
        ) : connected ? (
          <View style={styles.connectedBanner}>
            <MaterialIcons name="check-circle" size={22} color={colors.success} />
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
            <MaterialIcons name={integration.icon} size={26} color={colors.primary} />
          </View>
          <View style={styles.integrationCopy}>
            <Text style={styles.integrationTitle}>{integration.name}</Text>
            <Text style={styles.integrationDescription}>{integration.description}</Text>
          </View>
        </View>

        {connected && !reconnectPending ? (
          <Pressable style={styles.primaryButton} onPress={continueAfterConnect}>
            <MaterialIcons name="arrow-forward" size={22} color={colors.onPrimary} />
            <Text style={styles.primaryButtonText}>
              {fromCrm ? 'Return to CRM settings' : 'Continue to OpenAI key'}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
            onPress={() => void handleStartConnect()}
            disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <>
                <MaterialIcons name="link" size={22} color={colors.onPrimary} />
                <Text style={styles.primaryButtonText}>
                  {reconnectPending ? 'Reconnect with OAuth' : 'Connect with OAuth'}
                </Text>
              </>
            )}
          </Pressable>
        )}

        <Text style={styles.helperText}>
          After you approve in {integration.name}, you will see a success page in the browser, then
          return here via aiconcierge://oauth/{integration.id}?status=ok.
          {fromCrm
            ? ' You can disconnect later from CRM settings.'
            : ' You can disconnect later from Settings.'}
        </Text>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    maxWidth: 640,
    paddingBottom: UiSpacing.xxxl,
    paddingHorizontal: UiSpacing.lg,
    paddingTop: UiSpacing.xl,
    width: '100%',
  },
  headerIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: UiRadii.icon,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  title: {
    color: '#202124',
    fontSize: UiTypography.display.fontSize,
    fontWeight: '600',
    letterSpacing: -0.7,
    lineHeight: UiTypography.display.lineHeight,
    marginTop: UiSpacing.lg,
  },
  subtitle: {
    color: '#5F6368',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    marginTop: UiSpacing.sm,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: UiSpacing.sm,
    marginTop: UiSpacing.md,
  },
  statusText: {
    color: '#5F6368',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  connectedBanner: {
    alignItems: 'flex-start',
    backgroundColor: '#E6F4EA',
    borderColor: '#CEEAD6',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    marginTop: UiSpacing.md,
    padding: UiSpacing.md,
  },
  connectedCopy: {
    flex: 1,
  },
  connectedTitle: {
    color: '#137333',
    fontSize: UiTypography.cardHeading.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.cardHeading.lineHeight,
  },
  connectedSubtitle: {
    color: '#137333',
    fontSize: 13,
    lineHeight: 18,
    marginTop: UiSpacing.xxs,
  },
  integrationCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.md,
    marginTop: UiSpacing.xl,
    padding: UiSpacing.md,
  },
  integrationIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: UiRadii.icon,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  integrationCopy: {
    flex: 1,
  },
  integrationTitle: {
    color: '#202124',
    fontSize: UiTypography.cardHeading.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.cardHeading.lineHeight,
  },
  integrationDescription: {
    color: '#5F6368',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    marginTop: UiSpacing.xxs,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: UiRadii.control,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    justifyContent: 'center',
    marginTop: UiSpacing.lg,
    minHeight: UiControlHeights.button,
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: UiTypography.button.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.button.lineHeight,
  },
  helperText: {
    color: '#5F6368',
    fontSize: UiTypography.label.fontSize,
    lineHeight: 18,
    marginTop: UiSpacing.md,
    textAlign: 'center',
  },
});
