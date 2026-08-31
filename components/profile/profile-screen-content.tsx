import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenShell } from '@/components/screen';
import { Skeleton } from '@/components/ui/skeleton';
import {
  UiControlHeights,
  UiRadii,
  UiSpacing,
  UiTypography,
  type ResolvedTheme,
  type ThemeColors,
} from '@/constants/theme';
import { openaiApi, remindersApi } from '@/lib/api';
import { getMe, signOut } from '@/lib/api/auth';
import type { CrmProvider, User, UserPlan } from '@/lib/api/types';
import { CRM_LABELS } from '@/lib/crm/labels';
import {
  isActiveSubscription,
  listUserSubscriptions,
} from '@/lib/onboarding-route';
import { clearPushTokenCache } from '@/lib/push/register-push-token';
import { clearSession, getUser, refreshUser } from '@/lib/session';
import { useAppTheme } from '@/lib/theme/theme-provider';
import { useToast } from '@/lib/toast';

// ─── Static catalog ───────────────────────────────────────────────────────────

const assistantCapabilities = [
  {
    icon: 'contacts' as const,
    title: 'Contacts',
    description: 'Create, identify, list, update, and delete contacts via voice or text.',
  },
  {
    icon: 'event-available' as const,
    title: 'Calendars & appointments',
    description: 'Browse calendars, list upcoming events, and book new appointments.',
  },
  {
    icon: 'monetization-on' as const,
    title: 'Opportunities & pipelines',
    description: 'List pipelines, create and move opportunities across stages from a chat command.',
  },
  {
    icon: 'record-voice-over' as const,
    title: 'Voice + text commands',
    description: 'Hold the mic or type — the assistant transcribes and acts on intent.',
  },
  {
    icon: 'chat' as const,
    title: 'Conversations & Messages',
    description: 'Read and manage your GHL conversations directly.',
  },
];

const upcomingFeatures = [
  {
    icon: 'auto-fix-high' as const,
    title: 'Workflows & automations',
    description: 'Trigger CRM workflows ("send the welcome sequence to Maya") hands-free.',
  },
  {
    icon: 'forum' as const,
    title: 'SMS & email replies',
    description: 'Draft and send messages to contacts directly from the assistant.',
  },
  {
    icon: 'insights' as const,
    title: 'Pipeline insights',
    description: 'Ask "how many calls this week?" and get summarized analytics.',
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Component ────────────────────────────────────────────────────────────────

export function ProfileScreenContent() {
  const router = useRouter();
  const { show } = useToast();
  const { colors, resolvedTheme } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, resolvedTheme), [colors, resolvedTheme]);

  const [user, setUser] = useState<User | null>(() => getUser());
  const [openAIKeyLast4, setOpenAIKeyLast4] = useState<string | null>(null);
  const [openAIConnected, setOpenAIConnected] = useState<boolean | null>(null);
  const [loadingStatuses, setLoadingStatuses] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Refresh the user profile + integration statuses whenever the tab gains
  // focus, so a freshly-rotated key or reconnected CRM shows up immediately.
  const loadEverything = useCallback(async () => {
    setLoadingStatuses(true);
    try {
      const [meResult, openaiResult] = await Promise.allSettled([
        getMe(),
        openaiApi.getStatus(),
      ]);

      if (meResult.status === 'fulfilled') {
        setUser(meResult.value);
        await refreshUser(meResult.value).catch(() => undefined);
      }

      if (openaiResult.status === 'fulfilled') {
        setOpenAIConnected(openaiResult.value.exists);
        setOpenAIKeyLast4(openaiResult.value.last4 ?? null);
      } else {
        setOpenAIConnected(null);
      }
    } finally {
      setLoadingStatuses(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEverything();
    setRefreshing(false);
  }, [loadEverything]);

  useEffect(() => {
    void loadEverything();
  }, [loadEverything]);

  useFocusEffect(
    useCallback(() => {
      void loadEverything();
    }, [loadEverything]),
  );

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      // Best-effort: tell the backend to drop the push token before we
      // clear the JWT. After clearSession() the bearer is gone so we
      // couldn't authenticate this call any more.
      await remindersApi.setPushToken(null).catch(() => undefined);
      await clearPushTokenCache();
      await signOut().catch(() => undefined);
    } finally {
      await clearSession();
      show('Signed out.', 'success');
      router.replace('/signup');
    }
  }

  const initials = getInitials(user?.name, user?.email);
  const displayName = user?.name?.trim() || user?.email?.split('@')[0] || 'AI-Concierge';
  const connectedProvider: CrmProvider | null =
    user?.provider && user.integrations?.[user.provider]
      ? user.provider
      : user?.integrations?.ghl
        ? 'ghl'
        : user?.integrations?.hubspot
          ? 'hubspot'
          : user?.provider && user.hasIntegration
            ? user.provider
            : null;
  const subscriptions: UserPlan[] = listUserSubscriptions(user);
  const connectedPlan =
    subscriptions.find(
      (plan) =>
        connectedProvider != null &&
        plan.provider === connectedProvider &&
        isActiveSubscription(plan),
    ) ?? null;
  const crmBadgeLabel = connectedProvider
    ? connectedPlan
      ? formatPlanLabel(CRM_LABELS[connectedProvider], connectedPlan.status)
      : `${CRM_LABELS[connectedProvider]} · Connected`
    : null;
  const crmBadgeStyle = getTonePillStyle(connectedProvider ? 'success' : 'muted', colors);

  return (
    <ScreenShell edges={[]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}>
        {/* ── Profile card ──────────────────────────────────────────────────── */}
        <LinearGradient
          colors={resolvedTheme === 'dark' ? [colors.surfacePressed, colors.backgroundSecondary] : [colors.primaryMuted, colors.surfaceMuted]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.profileCard,
            resolvedTheme === 'dark' ? styles.profileCardDark : undefined,
          ]}>
          <View style={styles.profileHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.profileHeaderCopy}>
              <Text style={[styles.name, { color: resolvedTheme === 'dark' ? '#FFFFFF' : colors.textPrimary }]} numberOfLines={1}>
                {displayName}
              </Text>
              {user?.email ? (
                <Text style={[styles.subtitle, { color: resolvedTheme === 'dark' ? '#E2E8F0' : colors.textSecondary }]} numberOfLines={1}>
                  {user.email}
                </Text>
              ) : null}
              {crmBadgeLabel ? (
                <View
                  style={[
                    styles.planBadge,
                    { backgroundColor: crmBadgeStyle.bg, borderColor: crmBadgeStyle.border },
                  ]}>
                  <View style={[styles.planDot, { backgroundColor: crmBadgeStyle.fg }]} />
                  <Text
                    style={[styles.planBadgeText, { color: crmBadgeStyle.fg }]}
                    numberOfLines={1}>
                    {crmBadgeLabel}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </LinearGradient>

        {/* ── Connections ───────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connections</Text>

          {loadingStatuses && openAIConnected == null ? (
            <ConnectionsSkeleton />
          ) : (
            <>
              <ConnectionRow
                icon="vpn-key"
                title="OpenAI API key"
                value={
                  openAIConnected
                    ? openAIKeyLast4
                      ? `Current key ···${openAIKeyLast4}`
                      : 'Stored securely'
                    : 'Add a key to enable transcription & intent parsing'
                }
                statusLabel="OpenAI"
                tone={openAIConnected ? 'success' : 'muted'}
              />

              <Text style={[styles.sectionTitle, styles.subsectionTitle]}>Subscriptions</Text>
              {subscriptions.length === 0 ? (
                <View style={styles.subscriptionEmpty}>
                  <Text style={styles.capabilityTitle}>No subscription</Text>
                  <Text style={styles.capabilityText}>
                    Subscribe to a CRM plan to use GoHighLevel or HubSpot.
                  </Text>
                </View>
              ) : (
                <ScrollView
                  horizontal
                  nestedScrollEnabled
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  snapToInterval={SUBSCRIPTION_CARD_WIDTH + UiSpacing.sm}
                  snapToAlignment="start"
                  contentContainerStyle={styles.subscriptionCarousel}>
                  {subscriptions.map((plan) => (
                    <SubscriptionCard
                      key={`${plan.provider}-${plan.id}`}
                      plan={plan}
                      onUpgrade={() => show('Upgrade is coming soon.', 'info')}
                    />
                  ))}
                </ScrollView>
              )}
            </>
          )}
        </View>

        {/* ── Assistant scope ───────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assistant Capabilities</Text>
          {assistantCapabilities.map((cap) => (
            <CollapsibleCapability
              key={cap.title}
              icon={cap.icon}
              title={cap.title}
              description={cap.description}
            />
          ))}
        </View>

        {/* ── Upcoming features ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, styles.sectionTitleInRow]}>
              Upcoming features
            </Text>
            <View style={styles.soonBadge}>
              <Text style={styles.soonBadgeText}>Coming soon</Text>
            </View>
          </View>
          {upcomingFeatures.map((feature) => (
            <CollapsibleCapability
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              tone="info"
            />
          ))}
        </View>

        {/* ── Actions ───────────────────────────────────────────────────────── */}
        <View style={styles.actionsSection} pointerEvents={isLoggingOut ? 'box-none' : 'auto'}>
          <Pressable
            style={styles.actionButton}
            onPress={() => router.push('/settings')}
            disabled={isLoggingOut}>
            <View style={styles.actionIcon}>
              <MaterialIcons name="settings" size={20} color={colors.primary} />
            </View>
            <View style={styles.actionCopy}>
              <Text style={styles.actionTitle}>Settings</Text>
              <Text style={styles.actionDescription}>
                Manage your CRM connection, OpenAI key, and provider
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.iconMuted} />
          </Pressable>

          <Pressable
            style={[
              styles.actionButton,
              styles.logoutButton,
              isLoggingOut && styles.actionButtonDisabled,
            ]}
            onPress={handleLogout}
            disabled={isLoggingOut}>
            <View style={[styles.actionIcon, styles.logoutIcon]}>
              {isLoggingOut ? (
                <ActivityIndicator size="small" color={colors.danger} />
              ) : (
                <MaterialIcons name="logout" size={20} color={colors.danger} />
              )}
            </View>
            <View style={styles.actionCopy}>
              <Text style={[styles.actionTitle, styles.logoutTitle]}>
                {isLoggingOut ? 'Logging out…' : 'Logout'}
              </Text>
              <Text style={styles.actionDescription}>
                {isLoggingOut ? 'Please wait' : 'Sign out of AI-Concierge'}
              </Text>
            </View>
            {!isLoggingOut ? (
              <MaterialIcons name="chevron-right" size={22} color={colors.dangerBorder} />
            ) : null}
          </Pressable>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

type Tone = 'success' | 'muted' | 'brand' | 'warning';

const SUBSCRIPTION_CARD_WIDTH = Math.min(280, Dimensions.get('window').width - 72);

function subscriptionPalette(
  provider: CrmProvider,
  active: boolean,
  resolvedTheme: ResolvedTheme,
): {
  colors: [string, string];
  text: string;
  muted: string;
  iconBg: string;
  pillBg: string;
  buttonBg: string;
} {
  if (!active) {
    return resolvedTheme === 'dark'
      ? {
          colors: ['#1E293B', '#334155'],
          text: '#F8FAFC',
          muted: '#94A3B8',
          iconBg: 'rgba(255,255,255,0.08)',
          pillBg: 'rgba(255,255,255,0.12)',
          buttonBg: 'rgba(255,255,255,0.1)',
        }
      : {
          colors: ['#E8EAED', '#D3D6DB'],
          text: '#202124',
          muted: '#5F6368',
          iconBg: 'rgba(0,0,0,0.06)',
          pillBg: 'rgba(0,0,0,0.08)',
          buttonBg: 'rgba(0,0,0,0.06)',
        };
  }
  if (provider === 'hubspot') {
    return {
      colors:
        resolvedTheme === 'dark'
          ? (['#9A3412', '#C2410C'] as [string, string])
          : (['#FF7A59', '#E85D3D'] as [string, string]),
      text: '#FFFFFF',
      muted: 'rgba(255,255,255,0.88)',
      iconBg: 'rgba(255,255,255,0.18)',
      pillBg: 'rgba(255,255,255,0.22)',
      buttonBg: 'rgba(255,255,255,0.22)',
    };
  }
  return {
    colors:
      resolvedTheme === 'dark'
        ? (['#115E59', '#0F766E'] as [string, string])
        : (['#0D9488', '#0F766E'] as [string, string]),
    text: '#FFFFFF',
    muted: 'rgba(255,255,255,0.88)',
    iconBg: 'rgba(255,255,255,0.18)',
    pillBg: 'rgba(255,255,255,0.22)',
    buttonBg: 'rgba(255,255,255,0.22)',
  };
}

function SubscriptionCard({
  plan,
  onUpgrade,
}: {
  plan: UserPlan;
  onUpgrade: () => void;
}) {
  const { colors, resolvedTheme } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, resolvedTheme), [colors, resolvedTheme]);
  const active = isActiveSubscription(plan);
  const palette = subscriptionPalette(plan.provider, active, resolvedTheme);
  const crmLabel = CRM_LABELS[plan.provider];

  return (
    <LinearGradient
      colors={[palette.colors[0], palette.colors[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.subscriptionCard}>
      <View style={styles.subscriptionHeader}>
        <View style={[styles.connectionIcon, { backgroundColor: palette.iconBg }]}>
          <MaterialIcons name="workspace-premium" size={20} color={palette.text} />
        </View>
        <View style={styles.capabilityCopy}>
          <Text style={[styles.capabilityTitle, { color: palette.text }]} numberOfLines={1}>
            {crmLabel}
          </Text>
          <Text style={[styles.capabilityText, { color: palette.muted }]} numberOfLines={1}>
            {plan.name}
          </Text>
        </View>
        <View
          style={[
            styles.connectionStatus,
            {
              backgroundColor: palette.pillBg,
              flexDirection: 'row',
              alignItems: 'center',
              gap: UiSpacing.xxs,
            },
          ]}>
          <MaterialIcons
            name={active ? 'check-circle' : 'cancel'}
            size={14}
            color={palette.text}
          />
          <Text style={[styles.connectionStatusText, { color: palette.text }]} numberOfLines={1}>
            {active ? 'Active' : humanizePlanStatus(plan.status)}
          </Text>
        </View>
      </View>

      <View style={styles.subscriptionMeta}>
        <Text style={[styles.capabilityText, { color: palette.muted }]}>CRM</Text>
        <Text style={[styles.subscriptionMetaValue, { color: palette.text }]}>{crmLabel}</Text>
      </View>
      <View style={styles.subscriptionMeta}>
        <Text style={[styles.capabilityText, { color: palette.muted }]}>Status</Text>
        <Text style={[styles.subscriptionMetaValue, { color: palette.text }]}>
          {active ? 'Active' : humanizePlanStatus(plan.status)}
        </Text>
      </View>
      <View style={styles.subscriptionMeta}>
        <Text style={[styles.capabilityText, { color: palette.muted }]}>Expires</Text>
        <Text style={[styles.subscriptionMetaValue, { color: palette.text }]}>
          {formatExpiresAt(plan.expiresAt)}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        style={[styles.upgradeButton, { backgroundColor: palette.buttonBg, borderColor: 'transparent' }]}
        onPress={onUpgrade}>
        <MaterialIcons name="upgrade" size={18} color={palette.text} />
        <Text style={[styles.upgradeButtonText, { color: palette.text }]}>Upgrade</Text>
        <Text style={[styles.upgradeSoon, { color: palette.muted }]}>Coming soon</Text>
      </Pressable>
    </LinearGradient>
  );
}

function ConnectionRow({
  icon,
  title,
  value,
  statusLabel,
  tone,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  value: string;
  statusLabel: string;
  tone: Tone;
}) {
  const { colors, resolvedTheme } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, resolvedTheme), [colors, resolvedTheme]);
  const pillStyle = getTonePillStyle(tone, colors);
  return (
    <View style={styles.connectionRow}>
      <View style={styles.connectionIcon}>
        <MaterialIcons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.capabilityCopy}>
        <Text style={styles.capabilityTitle}>{title}</Text>
        <Text style={styles.capabilityText}>{value}</Text>
      </View>
      <View style={[styles.connectionStatus, { backgroundColor: pillStyle.bg, flexDirection: 'row', alignItems: 'center', gap: UiSpacing.xxs }]}>
        <MaterialIcons name={tone === 'success' ? 'check-circle' : 'cancel'} size={14} color={pillStyle.fg} />
        <Text style={[styles.connectionStatusText, { color: pillStyle.fg }]} numberOfLines={1}>
          {statusLabel}
        </Text>
      </View>
    </View>
  );
}

function ConnectionsSkeleton() {
  const { colors, resolvedTheme } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, resolvedTheme), [colors, resolvedTheme]);
  return (
    <>
      <ConnectionRowSkeleton />
      <Text style={[styles.sectionTitle, styles.subsectionTitle]}>Subscriptions</Text>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={SUBSCRIPTION_CARD_WIDTH + UiSpacing.sm}
        snapToAlignment="start"
        contentContainerStyle={styles.subscriptionCarousel}>
        <SubscriptionCardSkeleton />
        <SubscriptionCardSkeleton />
      </ScrollView>
    </>
  );
}

function ConnectionRowSkeleton() {
  const { colors, resolvedTheme } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, resolvedTheme), [colors, resolvedTheme]);
  return (
    <View style={styles.connectionRow}>
      <View style={styles.connectionIcon}>
        <Skeleton width={22} height={22} radius={6} />
      </View>
      <View style={styles.capabilityCopy}>
        <Skeleton width="55%" height={14} radius={6} />
        <Skeleton width="85%" height={11} radius={6} style={{ marginTop: 8 }} />
      </View>
      <Skeleton width={72} height={22} radius={999} />
    </View>
  );
}

function SubscriptionCardSkeleton() {
  const { colors, resolvedTheme } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, resolvedTheme), [colors, resolvedTheme]);
  return (
    <View style={styles.subscriptionCardSkeleton}>
      <View style={styles.subscriptionHeader}>
        <View style={styles.connectionIcon}>
          <Skeleton width={22} height={22} radius={6} />
        </View>
        <View style={styles.capabilityCopy}>
          <Skeleton width="50%" height={14} radius={6} />
          <Skeleton width="72%" height={11} radius={6} style={{ marginTop: 8 }} />
        </View>
        <Skeleton width={64} height={22} radius={999} />
      </View>

      <View style={styles.subscriptionMeta}>
        <Skeleton width={36} height={11} radius={6} />
        <Skeleton width={88} height={12} radius={6} />
      </View>
      <View style={styles.subscriptionMeta}>
        <Skeleton width={48} height={11} radius={6} />
        <Skeleton width={56} height={12} radius={6} />
      </View>
      <View style={styles.subscriptionMeta}>
        <Skeleton width={52} height={11} radius={6} />
        <Skeleton width={96} height={12} radius={6} />
      </View>

      <Skeleton
        height={UiControlHeights.compactButton}
        radius={UiRadii.control}
        style={{ marginTop: UiSpacing.xs }}
      />
    </View>
  );
}

function CollapsibleCapability({
  icon,
  title,
  description,
  tone = 'primary',
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  description: string;
  tone?: 'primary' | 'info';
}) {
  const { colors, resolvedTheme } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, resolvedTheme), [colors, resolvedTheme]);
  const [open, setOpen] = useState(false);

  const isInfo = tone === 'info';
  const rowStyle = isInfo ? styles.upcomingRow : styles.capabilityRow;
  const iconStyle = isInfo ? styles.upcomingIcon : styles.capabilityIcon;
  const iconColor = isInfo ? colors.info : colors.primary;

  return (
    <Pressable style={rowStyle} onPress={() => setOpen(!open)}>
      <View style={iconStyle}>
        <MaterialIcons name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.capabilityCopy}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.capabilityTitle}>{title}</Text>
          <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={20} color={colors.iconMuted} />
        </View>
        {open && (
          <Text style={[styles.capabilityText, { marginTop: UiSpacing.xs }]}>
            {description}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name?: string | null, email?: string | null): string {
  const source = (name && name.trim()) || (email && email.trim()) || '';
  if (!source) return 'AI';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return source.slice(0, 1).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function humanizePlanStatus(status: string): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'trialing':
      return 'Trial';
    case 'past_due':
      return 'Past due';
    case 'canceled':
      return 'Canceled';
    case 'unpaid':
      return 'Unpaid';
    case 'incomplete':
      return 'Incomplete';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function formatPlanLabel(name: string, status: string): string {
  return `${name} · ${humanizePlanStatus(status)}`;
}

function formatExpiresAt(iso?: string | null): string {
  if (!iso) return 'Not available';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function getTonePillStyle(tone: Tone, colors: ThemeColors) {
  if (tone === 'success') {
    return {
      bg: colors.successSurface,
      border: colors.successBorder,
      fg: colors.success,
    };
  }
  if (tone === 'warning') {
    return {
      bg: colors.warningSurface,
      border: colors.warningBorder,
      fg: colors.warning,
    };
  }
  if (tone === 'brand') {
    return {
      bg: colors.infoSurface,
      border: colors.infoBorder,
      fg: colors.info,
    };
  }
  return {
    bg: colors.surfaceMuted,
    border: colors.border,
    fg: colors.textSecondary,
  };
}

const makeStyles = (colors: ThemeColors, resolvedTheme: ResolvedTheme) =>
  StyleSheet.create({
  content: {
    alignSelf: 'center',
    maxWidth: 720,
    paddingBottom: 96,
    paddingHorizontal: UiSpacing.lg,
    paddingTop: UiSpacing.lg,
    width: '100%',
  },
  // ── Profile card ──
  profileCard: {
    borderColor: colors.borderStrong,
    borderRadius: UiRadii.card,
    borderWidth: 1,
    elevation: 2,
    padding: UiSpacing.xl,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  profileCardDark: {
    borderColor: colors.borderStrong,
    shadowColor: colors.shadow,
    shadowOpacity: 0.3,
  },
  profileHeader: {
    alignItems: 'center',
    flexDirection: 'column',
    gap: UiSpacing.md,
  },
  profileHeaderCopy: {
    alignItems: 'center',
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primaryMuted,
    borderRadius: UiRadii.pill,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  avatarText: {
    color: resolvedTheme === 'dark' ? '#FFFFFF' : colors.primary,
    fontSize: UiTypography.pageTitle.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.pageTitle.lineHeight,
  },
  name: {
    fontSize: UiTypography.sectionHeading.fontSize,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: UiTypography.sectionHeading.lineHeight,
  },
  subtitle: {
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '500',
    lineHeight: UiTypography.bodySmall.lineHeight,
    marginTop: UiSpacing.xxs,
  },
  planBadge: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: UiRadii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.xs,
    marginTop: UiSpacing.sm,
    paddingHorizontal: UiSpacing.sm,
    paddingVertical: UiSpacing.xxs,
  },
  planDot: {
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  planBadgeText: {
    fontSize: UiTypography.label.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.label.lineHeight,
  },

  // ── Sections ──
  section: {
    marginTop: UiSpacing.xl,
  },
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: UiSpacing.sm,
    marginBottom: UiSpacing.md,
  },
  sectionTitle: {
    color: resolvedTheme === 'dark' ? '#FFFFFF' : colors.textPrimary,
    fontSize: UiTypography.cardHeading.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.cardHeading.lineHeight,
    marginBottom: UiSpacing.md,
  },
  sectionTitleInRow: {
    marginBottom: 0,
  },
  subsectionTitle: {
    marginTop: UiSpacing.md,
    marginBottom: UiSpacing.sm,
  },
  soonBadge: {
    backgroundColor: resolvedTheme === 'dark' ? colors.infoSurface : colors.surfaceSelected,
    borderRadius: UiRadii.pill,
    paddingHorizontal: UiSpacing.sm,
    paddingVertical: UiSpacing.xxs,
  },
  soonBadgeText: {
    color: resolvedTheme === 'dark' ? '#FFFFFF' : colors.primaryPressed,
    fontSize: UiTypography.caption.fontSize,
    fontWeight: '700',
    letterSpacing: 0.3,
    lineHeight: UiTypography.caption.lineHeight,
    textTransform: 'uppercase',
  },
  // ── Connection rows ──
  connectionRow: {
    alignItems: 'center',
    backgroundColor: resolvedTheme === 'dark' ? colors.surfaceElevated : colors.surface,
    borderColor: resolvedTheme === 'dark' ? colors.borderStrong : colors.border,
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.md,
    marginBottom: UiSpacing.sm,
    minHeight: 64,
    padding: UiSpacing.md,
  },
  connectionIcon: {
    alignItems: 'center',
    backgroundColor: resolvedTheme === 'dark' ? colors.surfaceMuted : colors.primaryMuted,
    borderRadius: UiRadii.icon,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  connectionStatus: {
    borderRadius: UiRadii.pill,
    paddingHorizontal: UiSpacing.sm,
    paddingVertical: UiSpacing.xs,
  },
  connectionStatusText: {
    fontSize: UiTypography.label.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.label.lineHeight,
  },
  subscriptionCarousel: {
    gap: UiSpacing.sm,
    paddingBottom: UiSpacing.xxs,
    paddingRight: UiSpacing.lg,
  },
  subscriptionEmpty: {
    backgroundColor: resolvedTheme === 'dark' ? colors.surfaceElevated : colors.surface,
    borderColor: resolvedTheme === 'dark' ? colors.borderStrong : colors.border,
    borderRadius: UiRadii.card,
    borderWidth: 1,
    padding: UiSpacing.md,
  },
  subscriptionCard: {
    borderRadius: UiRadii.card,
    gap: UiSpacing.sm,
    padding: UiSpacing.md,
    width: SUBSCRIPTION_CARD_WIDTH,
  },
  subscriptionCardSkeleton: {
    backgroundColor: resolvedTheme === 'dark' ? colors.surfaceElevated : colors.surface,
    borderColor: resolvedTheme === 'dark' ? colors.borderStrong : colors.border,
    borderRadius: UiRadii.card,
    borderWidth: 1,
    gap: UiSpacing.sm,
    padding: UiSpacing.md,
    width: SUBSCRIPTION_CARD_WIDTH,
  },
  subscriptionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: UiSpacing.md,
  },
  subscriptionMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: UiSpacing.xxs,
  },
  subscriptionMetaValue: {
    color: resolvedTheme === 'dark' ? '#FFFFFF' : colors.textPrimary,
    fontSize: UiTypography.label.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.label.lineHeight,
  },
  upgradeButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
    borderRadius: UiRadii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.xs,
    height: UiControlHeights.compactButton,
    justifyContent: 'center',
    marginTop: UiSpacing.xs,
  },
  upgradeButtonText: {
    color: colors.primary,
    fontSize: UiTypography.button.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.button.lineHeight,
  },
  upgradeSoon: {
    color: colors.textMuted,
    fontSize: UiTypography.caption.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.caption.lineHeight,
  },
  // ── Capability rows ──
  capabilityRow: {
    alignItems: 'flex-start',
    backgroundColor: resolvedTheme === 'dark' ? colors.surfaceElevated : colors.surface,
    borderColor: resolvedTheme === 'dark' ? colors.borderStrong : colors.border,
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.md,
    marginBottom: UiSpacing.sm,
    minHeight: 64,
    padding: UiSpacing.md,
  },
  capabilityIcon: {
    alignItems: 'center',
    backgroundColor: resolvedTheme === 'dark' ? colors.surfaceMuted : colors.primaryMuted,
    borderRadius: UiRadii.icon,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  capabilityCopy: {
    flex: 1,
  },
  capabilityTitle: {
    color: resolvedTheme === 'dark' ? '#FFFFFF' : colors.textPrimary,
    fontSize: UiTypography.body.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.body.lineHeight,
  },
  capabilityText: {
    color: resolvedTheme === 'dark' ? '#E2E8F0' : colors.textSecondary,
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
    marginTop: UiSpacing.xxs,
  },
  // ── Upcoming rows ──
  upcomingRow: {
    alignItems: 'flex-start',
    backgroundColor: resolvedTheme === 'dark' ? colors.surfaceElevated : colors.surface,
    borderColor: resolvedTheme === 'dark' ? colors.borderStrong : colors.border,
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.md,
    marginBottom: UiSpacing.sm,
    minHeight: 64,
    padding: UiSpacing.md,
  },
  upcomingIcon: {
    alignItems: 'center',
    backgroundColor: resolvedTheme === 'dark' ? colors.surfaceMuted : colors.surfaceSelected,
    borderRadius: UiRadii.icon,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  // ── Actions ──
  actionsSection: {
    gap: UiSpacing.sm,
    marginTop: UiSpacing.xxl,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: resolvedTheme === 'dark' ? colors.surfaceElevated : colors.surface,
    borderColor: resolvedTheme === 'dark' ? colors.borderStrong : colors.border,
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.md,
    minHeight: 64,
    padding: UiSpacing.md,
  },
  logoutButton: {
    borderColor: colors.dangerBorder,
  },
  actionButtonDisabled: {
    opacity: 0.65,
  },
  actionIcon: {
    alignItems: 'center',
    backgroundColor: resolvedTheme === 'dark' ? colors.surfaceMuted : colors.primaryMuted,
    borderRadius: UiRadii.icon,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  logoutIcon: {
    backgroundColor: colors.dangerSurface,
  },
  actionCopy: {
    flex: 1,
  },
  actionTitle: {
    color: resolvedTheme === 'dark' ? '#FFFFFF' : colors.textPrimary,
    fontSize: UiTypography.body.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.body.lineHeight,
  },
  logoutTitle: {
    color: colors.dangerText,
  },
  actionDescription: {
    color: resolvedTheme === 'dark' ? '#E2E8F0' : colors.textSecondary,
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
    marginTop: UiSpacing.xxs,
  },
});
