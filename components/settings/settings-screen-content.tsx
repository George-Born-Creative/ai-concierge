import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ghlApi, hubspotApi, openaiApi } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import type {
  CrmProvider,
  GhlStatusResponse,
  HubspotStatusResponse,
  OpenAIKeyStatus,
} from '@/lib/api/types';
import { CRM_LABELS, getCrmLabelList } from '@/lib/crm/labels';
import { getOAuthReturnUrl, useCrmOAuth } from '@/lib/oauth';
import { getUser } from '@/lib/session';
import { useToast } from '@/lib/toast';

// Provider-aware copy + the api module + which `getStatus()` shape we expect.
// Labels come from the shared CRM_LABELS map so the only thing this screen
// needs when a new provider is added is the matching `api` entry below.
type ProviderMeta = {
  label: string;
  api: typeof ghlApi | typeof hubspotApi;
  /** Where the user goes to change OAuth scopes / rotate the app. */
  scopeManagementLocation: string;
};

const PROVIDER_META: Record<CrmProvider, ProviderMeta> = {
  ghl: {
    label: CRM_LABELS.ghl,
    api: ghlApi,
    scopeManagementLocation: `the ${CRM_LABELS.ghl} Marketplace`,
  },
  hubspot: {
    label: CRM_LABELS.hubspot,
    api: hubspotApi,
    scopeManagementLocation: `${CRM_LABELS.hubspot}'s connected-app settings`,
  },
};

type CrmStatus = GhlStatusResponse | HubspotStatusResponse;

export function SettingsScreenContent() {
  const router = useRouter();
  const { show } = useToast();

  const currentUser = getUser();
  // Default to GHL when the session has no provider yet (signed in but no
  // plan/integration). Settings is reachable from the home screen so we
  // shouldn't crash on a brand-new account.
  const provider: CrmProvider = currentUser?.provider ?? 'ghl';
  const meta = PROVIDER_META[provider];

  const [loadingStatus, setLoadingStatus] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<CrmStatus | null>(null);
  const [openaiStatus, setOpenaiStatus] = useState<OpenAIKeyStatus | null>(null);
  const [loadingOpenai, setLoadingOpenai] = useState(true);

  const onStatusChange = useCallback((isConnected: boolean) => {
    setConnected(isConnected);
  }, []);

  // useCrmOAuth is provider-agnostic — we just feed it the right `api` and
  // let the existing deep-link plumbing do the rest. Settings is its own
  // OAuth surface (separate from /connect onboarding), so it doesn't need to
  // pass `oauthStatus` / `oauthReason` route params here.
  const { startOAuthConnect } = useCrmOAuth({
    provider,
    api: meta.api,
    integrationName: meta.label,
    show,
    onStatusChange: (isConnected) => onStatusChange(isConnected),
    setLoadingStatus,
    setSubmitting,
  });

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const next = await meta.api.getStatus();
      setStatus(next);
      setConnected(next.connected);
    } catch {
      setStatus(null);
      setConnected(false);
    } finally {
      setLoadingStatus(false);
    }
  }, [meta]);

  const refreshOpenaiStatus = useCallback(async () => {
    setLoadingOpenai(true);
    try {
      const next = await openaiApi.getStatus();
      setOpenaiStatus(next);
    } catch {
      setOpenaiStatus(null);
    } finally {
      setLoadingOpenai(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshStatus();
      void refreshOpenaiStatus();
    }, [refreshStatus, refreshOpenaiStatus]),
  );

  async function handleDisconnect() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await meta.api.disconnect();
      await refreshStatus();
      show(`${meta.label} disconnected.`, 'success');
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : `Could not disconnect ${meta.label}.`;
      show(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReconnect() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const returnUrl = getOAuthReturnUrl(provider);
      // Eagerly invalidate the existing token row so the OAuth screen always
      // re-prompts for consent (e.g. after we add new scopes server-side).
      await meta.api.reconnect(returnUrl);
      setSubmitting(false);
      await startOAuthConnect();
    } catch (err) {
      setSubmitting(false);
      const message =
        err instanceof ApiError
          ? err.message
          : `Could not start ${meta.label} reconnect.`;
      show(message, 'error');
    }
  }

  function handleManageOpenaiKey() {
    router.push({
      pathname: '/openai-key',
      params: { from: 'settings', replace: '1' },
    });
  }

  function handleSwitchCrm() {
    show('CRM switching will be available once both providers are wired.', 'info');
  }

  // GHL has a precomputed `calendarScopesGranted` flag; HubSpot does not.
  const calendarScopesGranted =
    provider === 'ghl'
      ? (status as GhlStatusResponse | null)?.calendarScopesGranted
      : undefined;
  const calendarReady = calendarScopesGranted !== false;

  const hasOpenaiKey = openaiStatus?.exists === true;

  // Subtitle copy varies by provider so users see the right detail
  // (locationId for GHL, portalId for HubSpot) when connected.
  const integrationSubtitle = useMemo(() => {
    if (loadingStatus) return 'Checking…';
    if (!connected) return 'Tap to connect your account';

    if (provider === 'ghl') {
      const ghlStatus = status as GhlStatusResponse | null;
      return ghlStatus?.locationId
        ? `Location ${ghlStatus.locationId}`
        : 'Contacts, calendar & opportunities enabled';
    }

    const hubspotStatus = status as HubspotStatusResponse | null;
    return hubspotStatus?.portalId
      ? `Portal ${hubspotStatus.portalId}`
      : 'Contacts, deals & companies enabled';
  }, [connected, loadingStatus, provider, status]);

  return (
    <SafeAreaView style={styles.screen}>
      <PageHeader title="Settings" showBack onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Account group ─────────────────────────────────────────────────── */}
        <SectionLabel>Account</SectionLabel>
        <Group>
          <Row
            icon="person"
            iconBg="#E8F0FE"
            iconColor="#1A73E8"
            title="Edit profile"
            subtitle={currentUser?.name ?? currentUser?.email ?? 'Update your name, email, or password'}
            onPress={() => router.push('/edit-profile')}
          />
          <Divider />
          <Row
            icon="vpn-key"
            iconBg="#E8F0FE"
            iconColor="#1A73E8"
            title="OpenAI API key"
            subtitle={
              loadingOpenai
                ? 'Checking…'
                : hasOpenaiKey
                  ? openaiStatus?.last4
                    ? `Connected · ···${openaiStatus.last4}`
                    : 'Connected'
                  : 'Add a key to enable transcription & intent parsing'
            }
            right={
              loadingOpenai ? (
                <Skeleton width={56} height={20} radius={999} />
              ) : (
                <StatusPill
                  label={hasOpenaiKey ? 'Connected' : 'Not set'}
                  tone={hasOpenaiKey ? 'success' : 'muted'}
                />
              )
            }
            onPress={handleManageOpenaiKey}
          />
        </Group>
        {openaiStatus?.quotaWarning ? (
          <InfoBanner
            tone="warning"
            icon="warning"
            text="This OpenAI key looks low on quota. Rotate to a fresh key to keep voice commands working."
          />
        ) : null}

        {/* ── Integrations group ────────────────────────────────────────────── */}
        <SectionLabel>Integrations</SectionLabel>
        <Group>
          <Row
            icon="hub"
            iconBg="#E8F0FE"
            iconColor="#1A73E8"
            title={meta.label}
            subtitle={integrationSubtitle}
            right={
              loadingStatus ? (
                <Skeleton width={70} height={20} radius={999} />
              ) : (
                <StatusPill
                  label={connected ? 'Connected' : 'Not connected'}
                  tone={connected ? 'success' : 'muted'}
                />
              )
            }
            onPress={() => void handleReconnect()}
            disabled={submitting || loadingStatus}
            showChevron={false}
          />
          <Divider />
          <Row
            icon="swap-horiz"
            iconBg="#E8F0FE"
            iconColor="#1A73E8"
            title="CRM provider"
            subtitle={`Switch between ${getCrmLabelList(' and ')}`}
            right={
              <Text style={styles.rowValue} numberOfLines={1}>
                {meta.label}
              </Text>
            }
            onPress={handleSwitchCrm}
          />
        </Group>

        {provider === 'ghl' && connected && calendarScopesGranted === false ? (
          <InfoBanner
            tone="warning"
            icon="warning"
            text="Calendar scopes are missing on this token. Tap Reconnect to approve calendar access."
          />
        ) : connected && calendarReady && !loadingStatus ? null : null}

        {/* ── Integration actions ───────────────────────────────────────────── */}
        <View style={styles.actionStack}>
          <Pressable
            style={[styles.primaryButton, submitting && styles.buttonDisabled]}
            onPress={() => void handleReconnect()}
            disabled={submitting || loadingStatus}>
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {connected ? `Reconnect ${meta.label}` : `Connect ${meta.label}`}
              </Text>
            )}
          </Pressable>

          {connected ? (
            <Pressable
              style={[styles.dangerButton, submitting && styles.buttonDisabled]}
              onPress={() => void handleDisconnect()}
              disabled={submitting || loadingStatus}>
              <Text style={styles.dangerButtonText}>Disconnect</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.helpText}>
          {`Reconnect after enabling new scopes in ${meta.scopeManagementLocation}. This clears the old token and opens the authorisation screen again.`}
        </Text>

        {/* ── Notifications ─────────────────────────────────────────────────── */}
        <SectionLabel>Notifications</SectionLabel>
        <Group>
          <Row
            icon="notifications-active"
            iconBg="#E8F0FE"
            iconColor="#1A73E8"
            title="Reminders"
            subtitle="Manage scheduled reminders & push notifications"
            onPress={() => router.push('/(stack)/reminders')}
          />
        </Group>

        {/* ── About ─────────────────────────────────────────────────────────── */}
        <SectionLabel>About</SectionLabel>
        <Group>
          <Row
            icon="info"
            iconBg="#F1F3F4"
            iconColor="#5F6368"
            title="AI Concierge"
            subtitle="Voice & text CRM assistant"
            right={<Text style={styles.rowValue}>v1.0</Text>}
            showChevron={false}
            disabled
          />
        </Group>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Reusable row primitives ──────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children.toUpperCase()}</Text>;
}

function Group({ children }: { children: React.ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

function Divider() {
  return <View style={styles.divider} />;
}

type RowProps = {
  icon: keyof typeof MaterialIcons.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  showChevron?: boolean;
};

function Row({
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  right,
  onPress,
  disabled,
  showChevron = true,
}: RowProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        pressed && !disabled ? styles.rowPressed : null,
        disabled ? styles.rowDisabled : null,
      ]}
      onPress={onPress}
      disabled={disabled || !onPress}>
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
        <MaterialIcons name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.rowRight}>{right}</View> : null}
      {showChevron ? (
        <MaterialIcons name="chevron-right" size={22} color="#BDC1C6" />
      ) : null}
    </Pressable>
  );
}

type PillTone = 'success' | 'muted' | 'warning';

function StatusPill({ label, tone }: { label: string; tone: PillTone }) {
  const s = PILL[tone];
  return (
    <View style={[styles.pill, { backgroundColor: s.bg, borderColor: s.border }]}>
      <View style={[styles.pillDot, { backgroundColor: s.fg }]} />
      <Text style={[styles.pillText, { color: s.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function InfoBanner({
  tone,
  icon,
  text,
}: {
  tone: 'warning' | 'info';
  icon: keyof typeof MaterialIcons.glyphMap;
  text: string;
}) {
  const palette =
    tone === 'warning'
      ? { bg: '#FEF7E0', border: '#FCE8B2', fg: '#5F4400', icon: '#B06000' }
      : { bg: '#E8F0FE', border: '#C6DAFC', fg: '#174EA6', icon: '#1A73E8' };
  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}>
      <MaterialIcons name={icon} size={18} color={palette.icon} />
      <Text style={[styles.bannerText, { color: palette.fg }]}>{text}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PILL: Record<PillTone, { bg: string; border: string; fg: string }> = {
  success: { bg: '#E6F4EA', border: '#B7E1C0', fg: '#1E8E3E' },
  muted: { bg: '#F1F3F4', border: '#E0E3E7', fg: '#5F6368' },
  warning: { bg: '#FEF7E0', border: '#FCE8B2', fg: '#B06000' },
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F4F8',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 48,
    paddingTop: 8,
  },

  // ── Section labels & groups ──
  sectionLabel: {
    color: '#80868B',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    marginBottom: 8,
    marginLeft: 4,
    marginTop: 22,
  },
  group: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  divider: {
    backgroundColor: '#EEF0F3',
    height: 1,
    marginLeft: 60,
  },

  // ── Row ──
  row: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowPressed: {
    backgroundColor: '#F6F8FB',
  },
  rowDisabled: {
    opacity: 0.85,
  },
  rowIcon: {
    alignItems: 'center',
    borderRadius: 10,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  rowCopy: {
    flex: 1,
  },
  rowTitle: {
    color: '#202124',
    fontSize: 15,
    fontWeight: '600',
  },
  rowSubtitle: {
    color: '#5F6368',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'flex-end',
    maxWidth: 160,
  },
  rowValue: {
    color: '#5F6368',
    fontSize: 14,
    fontWeight: '500',
  },

  // ── Pill ──
  pill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillDot: {
    borderRadius: 4,
    height: 6,
    width: 6,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Banner ──
  banner: {
    alignItems: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    padding: 12,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },

  // ── Action buttons ──
  actionStack: {
    gap: 10,
    marginTop: 14,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: 14,
    minHeight: 50,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  dangerButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#FAD2CF',
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 50,
    justifyContent: 'center',
  },
  dangerButtonText: {
    color: '#EA4335',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },

  helpText: {
    color: '#80868B',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    paddingHorizontal: 4,
  },
});
