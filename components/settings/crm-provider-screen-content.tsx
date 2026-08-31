import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  UiControlHeights,
  UiRadii,
  UiSpacing,
  UiTypography,
} from '@/constants/theme';
import { ghlApi, hubspotApi } from '@/lib/api';
import { getMe } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import type { CrmProvider, User } from '@/lib/api/types';
import { CRM_LABELS, otherCrmProvider } from '@/lib/crm/labels';
import { setOAuthReturnFrom } from '@/lib/oauth';
import { hasCrmEntitlement } from '@/lib/onboarding-route';
import { getUser, refreshUser } from '@/lib/session';
import { useAppTheme } from '@/lib/theme/theme-provider';
import { useToast } from '@/lib/toast';

type ProviderApi = typeof ghlApi | typeof hubspotApi;

const PROVIDER_META: Record<
  CrmProvider,
  {
    label: string;
    icon: keyof typeof MaterialIcons.glyphMap;
    api: ProviderApi;
  }
> = {
  ghl: { label: CRM_LABELS.ghl, icon: 'hub', api: ghlApi },
  hubspot: { label: CRM_LABELS.hubspot, icon: 'cloud', api: hubspotApi },
};

type CardState = {
  connected: boolean;
  entitled: boolean;
  detail: string | null;
  calendarScopesGranted?: boolean;
};

const EMPTY_CARD: CardState = { connected: false, entitled: false, detail: null };

function displayedCrm(
  user: User | null,
  cards: Record<CrmProvider, CardState>,
): CrmProvider {
  const active = user?.provider ?? null;
  if (active && cards[active].connected) return active;
  if (cards.ghl.connected) return 'ghl';
  if (cards.hubspot.connected) return 'hubspot';
  return active ?? 'ghl';
}

export function CrmProviderScreenContent() {
  const router = useRouter();
  const { show } = useToast();
  const { colors } = useAppTheme();

  const [user, setUser] = useState<User | null>(() => getUser());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cards, setCards] = useState<Record<CrmProvider, CardState>>({
    ghl: EMPTY_CARD,
    hubspot: EMPTY_CARD,
  });

  const provider = displayedCrm(user, cards);
  const other = otherCrmProvider(provider);
  const state = cards[provider];
  const meta = PROVIDER_META[provider];
  const otherMeta = PROVIDER_META[other];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meResult, ghlResult, hubspotResult] = await Promise.allSettled([
        getMe(),
        ghlApi.getStatus(),
        hubspotApi.getStatus(),
      ]);

      let nextUser = getUser();
      if (meResult.status === 'fulfilled') {
        nextUser = meResult.value;
        setUser(nextUser);
        await refreshUser(meResult.value).catch(() => undefined);
      }

      setCards({
        ghl: {
          entitled: hasCrmEntitlement(nextUser, 'ghl'),
          connected: ghlResult.status === 'fulfilled' && ghlResult.value.connected,
          detail:
            ghlResult.status === 'fulfilled' && ghlResult.value.locationId
              ? `Location ${ghlResult.value.locationId}`
              : null,
          calendarScopesGranted:
            ghlResult.status === 'fulfilled'
              ? ghlResult.value.calendarScopesGranted
              : undefined,
        },
        hubspot: {
          entitled: hasCrmEntitlement(nextUser, 'hubspot'),
          connected: hubspotResult.status === 'fulfilled' && hubspotResult.value.connected,
          detail:
            hubspotResult.status === 'fulfilled' && hubspotResult.value.portalId
              ? `Portal ${hubspotResult.value.portalId}`
              : null,
        },
      });

      if (ghlResult.status === 'rejected' || hubspotResult.status === 'rejected') {
        show('Could not refresh CRM status. Pull to retry.', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [show]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function startConnect(next: CrmProvider) {
    setOAuthReturnFrom('crm');
    if (!cards[next].entitled) {
      router.push({ pathname: '/plan', params: { from: 'crm', provider: next } });
      return;
    }
    router.push({ pathname: '/connect', params: { from: 'crm', provider: next } });
  }

  function handleReconnect() {
    setOAuthReturnFrom('crm');
    router.push({
      pathname: '/connect',
      params: { from: 'crm', provider, reconnect: '1' },
    });
  }

  async function handleDisconnect() {
    if (busy) return;
    setBusy(true);
    try {
      await meta.api.disconnect();
      setCards((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], connected: false, detail: null },
      }));
      const me = await getMe();
      setUser(me);
      await refreshUser(me);
      show(`${meta.label} disconnected.`, 'success');
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : `Could not disconnect ${meta.label}.`;
      show(message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function confirmSwitch() {
    if (busy) return;
    setBusy(true);
    try {
      if (state.connected) {
        await meta.api.disconnect();
        setCards((prev) => ({
          ...prev,
          [provider]: { ...prev[provider], connected: false, detail: null },
        }));
      }
      startConnect(other);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : `Could not switch to ${otherMeta.label}.`;
      show(message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function handleSwitch() {
    const nextStep = cards[other].entitled
      ? `connect ${otherMeta.label} (already subscribed — no new charge)`
      : `subscribe to ${otherMeta.label}`;
    const body = state.connected
      ? `This disconnects ${meta.label}. You'll ${nextStep} next.`
      : `You'll ${nextStep} next.`;
    Alert.alert(`Switch to ${otherMeta.label}?`, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Switch', onPress: () => void confirmSwitch() },
    ]);
  }

  const statusLabel = loading
    ? 'Checking…'
    : state.connected
      ? 'Connected'
      : !state.entitled
        ? 'No plan'
        : 'Not connected';
  const statusTone: 'success' | 'warning' | 'muted' = state.connected
    ? 'success'
    : !state.entitled
      ? 'warning'
      : 'muted';
  const subtitle = loading
    ? 'Checking…'
    : state.connected
      ? (state.detail ?? `${meta.label} is connected`)
      : !state.entitled
        ? `Subscribe to use ${meta.label}`
        : `${meta.label} is not connected`;
  const ghlCalendarWarning =
    provider === 'ghl' && state.connected && state.calendarScopesGranted === false;

  return (
    <ScreenShell edges={['bottom']}>
      <PageHeader title="CRM" showBack onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          You can pay for both GoHighLevel and HubSpot. Only one CRM can be connected at a
          time. If you already subscribe to the other CRM, switching disconnects this one
          and connects the other — you will not be charged again.
        </Text>

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: state.connected ? colors.primary : colors.border,
            },
          ]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconWrap, { backgroundColor: colors.primaryMuted }]}>
              <MaterialIcons name={meta.icon} size={22} color={colors.primary} />
            </View>
            <View style={styles.cardCopy}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{meta.label}</Text>
              <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
            </View>
            {loading ? (
              <Skeleton width={88} height={22} radius={999} />
            ) : (
              <StatusPill label={statusLabel} tone={statusTone} />
            )}
          </View>

          <View style={styles.actions}>
            {state.connected ? (
              <View style={styles.secondaryRow}>
                <Pressable
                  style={[
                    styles.secondaryButton,
                    { borderColor: colors.border },
                    busy && styles.buttonDisabled,
                  ]}
                  onPress={handleReconnect}
                  disabled={busy || loading}>
                  <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>
                    Reconnect
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.dangerButton,
                    { borderColor: colors.dangerBorder },
                    busy && styles.buttonDisabled,
                  ]}
                  onPress={() => void handleDisconnect()}
                  disabled={busy || loading}>
                  {busy ? (
                    <ActivityIndicator color={colors.danger} />
                  ) : (
                    <Text style={[styles.dangerButtonText, { color: colors.danger }]}>
                      Disconnect
                    </Text>
                  )}
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={[
                  styles.primaryButton,
                  { backgroundColor: colors.primary },
                  (busy || loading) && styles.buttonDisabled,
                ]}
                onPress={() => startConnect(provider)}
                disabled={busy || loading}>
                <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
                  {state.entitled ? 'Connect' : `Get ${meta.label} plan`}
                </Text>
              </Pressable>
            )}

            <Pressable
              style={[
                styles.switchButton,
                { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
                (busy || loading) && styles.buttonDisabled,
              ]}
              onPress={handleSwitch}
              disabled={busy || loading}>
              <MaterialIcons name="swap-horiz" size={20} color={colors.primary} />
              <Text style={[styles.switchButtonText, { color: colors.primary }]}>
                Switch to {otherMeta.label}
              </Text>
            </Pressable>
          </View>
        </View>

        {ghlCalendarWarning ? (
          <Text style={[styles.intro, { color: colors.warning }]}>
            Calendar scopes are missing on GoHighLevel. Tap Reconnect to approve calendar access.
          </Text>
        ) : null}
      </ScrollView>
    </ScreenShell>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: 'success' | 'muted' | 'warning';
}) {
  const { colors } = useAppTheme();
  const s =
    tone === 'success'
      ? { bg: colors.successSurface, border: colors.successBorder, fg: colors.success }
      : tone === 'warning'
        ? { bg: colors.warningSurface, border: colors.warningBorder, fg: colors.warning }
        : { bg: colors.surfaceMuted, border: colors.border, fg: colors.textSecondary };
  return (
    <View style={[styles.pill, { backgroundColor: s.bg, borderColor: s.border }]}>
      <View style={[styles.pillDot, { backgroundColor: s.fg }]} />
      <Text style={[styles.pillText, { color: s.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    gap: UiSpacing.md,
    maxWidth: 720,
    paddingBottom: UiSpacing.xxxl,
    paddingHorizontal: UiSpacing.lg,
    width: '100%',
  },
  intro: {
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    marginBottom: UiSpacing.xs,
  },
  card: {
    borderRadius: UiRadii.card,
    borderWidth: 1,
    padding: UiSpacing.md,
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: UiSpacing.md,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: UiRadii.icon,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  cardCopy: {
    flex: 1,
  },
  cardTitle: {
    fontSize: UiTypography.body.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.body.lineHeight,
  },
  cardSubtitle: {
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
    marginTop: UiSpacing.xxs,
  },
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
  },
  actions: {
    gap: UiSpacing.sm,
    marginTop: UiSpacing.md,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: UiRadii.control,
    height: UiControlHeights.button,
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '700',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: UiSpacing.sm,
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: UiRadii.control,
    borderWidth: 1,
    flex: 1,
    height: UiControlHeights.button,
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '600',
  },
  dangerButton: {
    alignItems: 'center',
    borderRadius: UiRadii.control,
    borderWidth: 1,
    flex: 1,
    height: UiControlHeights.button,
    justifyContent: 'center',
  },
  dangerButtonText: {
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '700',
  },
  switchButton: {
    alignItems: 'center',
    borderRadius: UiRadii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.xs,
    height: UiControlHeights.button,
    justifyContent: 'center',
  },
  switchButtonText: {
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
