import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PageHeader } from '@/components/page-header';
import { ScreenShell } from '@/components/screen';
import { Skeleton } from '@/components/ui/skeleton';
import {
  UiRadii,
  UiSpacing,
  UiTypography,
} from '@/constants/theme';
import { ghlApi, hubspotApi, openaiApi } from '@/lib/api';
import type {
  CrmProvider,
  GhlStatusResponse,
  HubspotStatusResponse,
  OpenAIKeyStatus,
} from '@/lib/api/types';
import { CRM_LABELS } from '@/lib/crm/labels';
import { getUser } from '@/lib/session';
import { getRuntimeVersion } from '@/lib/support/version';
import { useAppTheme } from '@/lib/theme/theme-provider';

// Provider-aware copy + the api module + which `getStatus()` shape we expect.
// Labels come from the shared CRM_LABELS map so the only thing this screen
// needs when a new provider is added is the matching `api` entry below.
type ProviderMeta = {
  label: string;
  api: typeof ghlApi | typeof hubspotApi;
};

const PROVIDER_META: Record<CrmProvider, ProviderMeta> = {
  ghl: {
    label: CRM_LABELS.ghl,
    api: ghlApi,
  },
  hubspot: {
    label: CRM_LABELS.hubspot,
    api: hubspotApi,
  },
};

type CrmStatus = GhlStatusResponse | HubspotStatusResponse;

export function SettingsScreenContent() {
  const router = useRouter();
  const { colors, preference, setPreference } = useAppTheme();

  const currentUser = getUser();
  // Default to GHL when the session has no provider yet (signed in but no
  // plan/integration). Settings is reachable from the home screen so we
  // shouldn't crash on a brand-new account.
  const provider: CrmProvider = currentUser?.provider ?? 'ghl';
  const meta = PROVIDER_META[provider];

  const [loadingStatus, setLoadingStatus] = useState(true);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<CrmStatus | null>(null);
  const [openaiStatus, setOpenaiStatus] = useState<OpenAIKeyStatus | null>(null);
  const [loadingOpenai, setLoadingOpenai] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([refreshStatus(), refreshOpenaiStatus()]);
    setRefreshing(false);
  }, [refreshStatus, refreshOpenaiStatus]);

  useFocusEffect(
    useCallback(() => {
      void refreshStatus();
      void refreshOpenaiStatus();
    }, [refreshStatus, refreshOpenaiStatus]),
  );

  function handleManageOpenaiKey() {
    router.push({
      pathname: '/openai-key',
      params: { from: 'settings', replace: '1' },
    });
  }

  function handleOpenCrmProvider() {
    router.push('/settings/crm');
  }

  // GHL has a precomputed `calendarScopesGranted` flag; HubSpot does not.
  const calendarScopesGranted =
    provider === 'ghl'
      ? (status as GhlStatusResponse | null)?.calendarScopesGranted
      : undefined;

  const hasOpenaiKey = openaiStatus?.exists === true;

  // Subtitle copy varies by provider so users see the right detail
  // (locationId for GHL, portalId for HubSpot) when connected.
  const integrationSubtitle = useMemo(() => {
    if (loadingStatus) return 'Checking…';
    if (!connected) return 'Tap to connect, reconnect, or switch';

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
    <ScreenShell edges={['bottom']}>
      <PageHeader title="Settings" showBack onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}>
        {/* ── Account group ─────────────────────────────────────────────────── */}
        <SectionLabel>Appearance</SectionLabel>
        <Group>
          <Row
            icon="brightness-auto"
            iconBg={colors.primaryMuted}
            iconColor={colors.primary}
            title="System default"
            subtitle="Match this device's appearance"
            selected={preference === 'system'}
            onPress={() => void setPreference('system')}
          />
          <Divider />
          <Row
            icon="light-mode"
            iconBg={colors.warningSurface}
            iconColor={colors.warning}
            title="Light"
            subtitle="Always use the light appearance"
            selected={preference === 'light'}
            onPress={() => void setPreference('light')}
          />
          <Divider />
          <Row
            icon="dark-mode"
            iconBg={colors.infoSurface}
            iconColor={colors.info}
            title="Dark"
            subtitle="Always use the dark appearance"
            selected={preference === 'dark'}
            onPress={() => void setPreference('dark')}
          />
        </Group>

        <SectionLabel>Account</SectionLabel>
        <Group>
          <Row
            icon="person"
            iconBg={colors.primaryMuted}
            iconColor={colors.primary}
            title="Edit profile"
            subtitle={currentUser?.name ?? currentUser?.email ?? 'Update your name, email, or password'}
            onPress={() => router.push('/edit-profile')}
          />
          <Divider />
          <Row
            icon="vpn-key"
            iconBg={colors.primaryMuted}
            iconColor={colors.primary}
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
            iconBg={colors.primaryMuted}
            iconColor={colors.primary}
            title={connected ? meta.label : 'CRM'}
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
            onPress={handleOpenCrmProvider}
            showChevron
          />
        </Group>

        {provider === 'ghl' && connected && calendarScopesGranted === false ? (
          <InfoBanner
            tone="warning"
            icon="warning"
            text="Calendar scopes are missing on this token. Open the CRM to reconnect and approve calendar access."
          />
        ) : null}

        <Text style={[styles.helpText, { color: colors.textMuted }]}>
          Only one CRM can be connected at a time. Open it to reconnect, disconnect, or switch.
        </Text>

        {/* ── About ─────────────────────────────────────────────────────────── */}
        <SectionLabel>Support</SectionLabel>
        <Group>
          <Row
            icon="help-outline"
            iconBg={colors.infoSurface}
            iconColor={colors.info}
            title="Help & Support"
            subtitle="Articles, troubleshooting, and contact"
            onPress={() => router.push('/support' as never)}
          />
        </Group>

        <SectionLabel>About</SectionLabel>
        <Group>
          <Row
            icon="info"
            iconBg={colors.surfaceMuted}
            iconColor={colors.icon}
            title="AI Concierge"
            subtitle="Voice & text CRM assistant"
            right={<Text style={[styles.rowValue, { color: colors.textSecondary }]}>{getRuntimeVersion()}</Text>}
            showChevron={false}
            disabled
          />
        </Group>
      </ScrollView>
    </ScreenShell>
  );
}

// ─── Reusable row primitives ──────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return (
    <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
      {children.toUpperCase()}
    </Text>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        styles.group,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}>
      {children}
    </View>
  );
}

function Divider() {
  const { colors } = useAppTheme();
  return <View style={[styles.divider, { backgroundColor: colors.divider }]} />;
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
  selected?: boolean;
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
  selected,
}: RowProps) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole={selected === undefined ? 'button' : 'radio'}
      accessibilityState={
        selected === undefined ? { disabled } : { checked: selected, disabled }
      }
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected
            ? colors.surfaceSelected
            : pressed && !disabled
              ? colors.surfacePressed
              : colors.surface,
        },
        disabled ? styles.rowDisabled : null,
      ]}
      onPress={onPress}
      disabled={disabled || !onPress}>
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
        <MaterialIcons name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.rowRight}>{right}</View> : null}
      {selected !== undefined ? (
        <MaterialIcons
          name={selected ? 'check-circle' : 'radio-button-unchecked'}
          size={22}
          color={selected ? colors.primary : colors.iconMuted}
        />
      ) : showChevron ? (
        <MaterialIcons name="chevron-right" size={22} color={colors.iconMuted} />
      ) : null}
    </Pressable>
  );
}

type PillTone = 'success' | 'muted' | 'warning';

function StatusPill({ label, tone }: { label: string; tone: PillTone }) {
  const { colors } = useAppTheme();
  const s =
    tone === 'success'
      ? {
          bg: colors.successSurface,
          border: colors.successBorder,
          fg: colors.success,
        }
      : tone === 'warning'
        ? {
            bg: colors.warningSurface,
            border: colors.warningBorder,
            fg: colors.warning,
          }
        : {
            bg: colors.surfaceMuted,
            border: colors.border,
            fg: colors.textSecondary,
          };
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
  const { colors } = useAppTheme();
  const palette =
    tone === 'warning'
      ? {
          bg: colors.warningSurface,
          border: colors.warningBorder,
          fg: colors.warningText,
          icon: colors.warning,
        }
      : {
          bg: colors.infoSurface,
          border: colors.infoBorder,
          fg: colors.infoText,
          icon: colors.info,
        };
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

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    maxWidth: 720,
    paddingBottom: UiSpacing.xxxl,
    paddingHorizontal: UiSpacing.lg,
    width: '100%',
  },

  // ── Section labels & groups ──
  sectionLabel: {
    fontSize: UiTypography.caption.fontSize,
    fontWeight: '700',
    letterSpacing: 1.1,
    lineHeight: UiTypography.caption.lineHeight,
    marginBottom: UiSpacing.sm,
    marginLeft: UiSpacing.xxs,
    marginTop: UiSpacing.xl,
  },
  group: {
    borderRadius: UiRadii.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    marginLeft: 56,
  },

  // ── Row ──
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: UiSpacing.md,
    minHeight: 56,
    paddingHorizontal: UiSpacing.md,
    paddingVertical: UiSpacing.sm,
  },
  rowDisabled: {
    opacity: 0.85,
  },
  rowIcon: {
    alignItems: 'center',
    borderRadius: UiRadii.icon,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  rowCopy: {
    flex: 1,
  },
  rowTitle: {
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  rowSubtitle: {
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
    marginTop: UiSpacing.xxs,
  },
  rowRight: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: UiSpacing.xs,
    justifyContent: 'flex-end',
    maxWidth: 160,
  },
  rowValue: {
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '500',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },

  // ── Pill ──
  pill: {
    alignItems: 'center',
    borderRadius: UiRadii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.xs,
    paddingHorizontal: UiSpacing.sm,
    paddingVertical: UiSpacing.xxs,
  },
  pillDot: {
    borderRadius: 4,
    height: 6,
    width: 6,
  },
  pillText: {
    fontSize: UiTypography.caption.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.caption.lineHeight,
  },

  // ── Banner ──
  banner: {
    alignItems: 'flex-start',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    marginTop: UiSpacing.sm,
    padding: UiSpacing.md,
  },
  bannerText: {
    flex: 1,
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
  },

  helpText: {
    fontSize: UiTypography.caption.fontSize,
    lineHeight: UiTypography.caption.lineHeight,
    marginTop: UiSpacing.sm,
    paddingHorizontal: UiSpacing.xxs,
  },
});
