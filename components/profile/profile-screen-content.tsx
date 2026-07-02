import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenShell } from '@/components/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { ghlApi, hubspotApi, openaiApi, remindersApi } from '@/lib/api';
import { getMe, signOut } from '@/lib/api/auth';
import type { CrmProvider, User } from '@/lib/api/types';
import { getCrmLabel, getCrmLabelList } from '@/lib/crm/labels';
import { clearPushTokenCache } from '@/lib/push/register-push-token';
import { clearSession, getUser, refreshUser } from '@/lib/session';
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
  {
    icon: 'hub' as const,
    title: 'Multi-CRM support',
    description: `Connect ${getCrmLabelList(' and ')} and switch between them.`,
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type CrmStatus = {
  provider: CrmProvider;
  connected: boolean;
  detail?: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ProfileScreenContent() {
  const router = useRouter();
  const { show } = useToast();

  const [user, setUser] = useState<User | null>(() => getUser());
  const [crmStatus, setCrmStatus] = useState<CrmStatus | null>(null);
  const [openAIKeyLast4, setOpenAIKeyLast4] = useState<string | null>(null);
  const [openAIConnected, setOpenAIConnected] = useState<boolean | null>(null);
  const [loadingStatuses, setLoadingStatuses] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Refresh the user profile + integration statuses whenever the tab gains
  // focus, so a freshly-rotated key or reconnected CRM shows up immediately.
  const loadEverything = useCallback(async () => {
    setLoadingStatuses(true);
    try {
      const [meResult, openaiResult, ghlResult, hubspotResult] = await Promise.allSettled([
        getMe(),
        openaiApi.getStatus(),
        ghlApi.getStatus(),
        hubspotApi.getStatus(),
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

      // Pick the CRM the user is actually on. Fall back to whichever provider
      // reports connected, then GHL as a default.
      const meProvider = meResult.status === 'fulfilled' ? meResult.value.provider : null;
      const ghlConnected = ghlResult.status === 'fulfilled' && ghlResult.value.connected;
      const hubspotConnected = hubspotResult.status === 'fulfilled' && hubspotResult.value.connected;

      let resolvedProvider: CrmProvider | null = meProvider ?? null;
      if (!resolvedProvider) {
        if (ghlConnected) resolvedProvider = 'ghl';
        else if (hubspotConnected) resolvedProvider = 'hubspot';
        else resolvedProvider = 'ghl';
      }

      if (resolvedProvider === 'ghl') {
        setCrmStatus({
          provider: 'ghl',
          connected: ghlConnected,
          detail:
            ghlResult.status === 'fulfilled' && ghlResult.value.locationId
              ? `Location ${ghlResult.value.locationId}`
              : undefined,
        });
      } else {
        setCrmStatus({
          provider: 'hubspot',
          connected: hubspotConnected,
          detail:
            hubspotResult.status === 'fulfilled' && hubspotResult.value.portalId
              ? `Portal ${hubspotResult.value.portalId}`
              : undefined,
        });
      }
    } finally {
      setLoadingStatuses(false);
    }
  }, []);

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
  const planLabel = user?.plan ? formatPlanLabel(user.plan.name, user.plan.status) : null;
  const crmLabel = getCrmLabel(crmStatus?.provider ?? null);
  const planBadgeStyle = TONE_PILL_STYLES[user?.plan ? planTone(user.plan.status) : 'muted'];

  return (
    <ScreenShell edges={[]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
        overScrollMode="never">
        {/* ── Profile card ──────────────────────────────────────────────────── */}
        <View style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.profileHeaderCopy}>
              <Text style={styles.name} numberOfLines={1}>
                {displayName}
              </Text>
              {user?.email ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {user.email}
                </Text>
              ) : null}
              {planLabel ? (
                <View
                  style={[
                    styles.planBadge,
                    { backgroundColor: planBadgeStyle.bg, borderColor: planBadgeStyle.border },
                  ]}>
                  <View style={[styles.planDot, { backgroundColor: planBadgeStyle.fg }]} />
                  <Text
                    style={[styles.planBadgeText, { color: planBadgeStyle.fg }]}
                    numberOfLines={1}>
                    {planLabel}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.profileDivider} />

          {/* Connection status pills. */}
          <View style={styles.statusRow}>
            {loadingStatuses && !crmStatus && openAIConnected == null ? (
              <>
                <Skeleton width={150} height={30} radius={999} />
                <Skeleton width={130} height={30} radius={999} />
              </>
            ) : (
              <>
                <StatusPill
                  icon="hub"
                  label={crmStatus?.connected ? `${crmLabel} · Connected` : `${crmLabel} · Not connected`}
                  tone={crmStatus?.connected ? 'success' : 'muted'}
                />
                <StatusPill
                  icon="vpn-key"
                  label={openAIConnected ? 'OpenAI · Connected' : 'OpenAI · Not set'}
                  tone={openAIConnected ? 'success' : 'muted'}
                />
              </>
            )}
          </View>
        </View>

        {/* ── Connections ───────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connections</Text>

          {loadingStatuses && !crmStatus && openAIConnected == null ? (
            <>
              <ConnectionRowSkeleton />
              <ConnectionRowSkeleton />
              <ConnectionRowSkeleton />
            </>
          ) : (
            <>
              <ConnectionRow
                icon="hub"
                title={crmLabel}
                value={
                  crmStatus?.connected
                    ? crmStatus.detail ?? 'Connected — contacts & calendars enabled'
                    : 'Not connected — open Settings to connect'
                }
                statusLabel={crmStatus?.connected ? 'Connected' : 'Off'}
                tone={crmStatus?.connected ? 'success' : 'muted'}
              />

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
                statusLabel={openAIConnected ? 'Connected' : 'Not set'}
                tone={openAIConnected ? 'success' : 'muted'}
              />

              <ConnectionRow
                icon="workspace-premium"
                title="Subscription"
                value={
                  user?.plan
                    ? `${user.plan.name} (${humanizePlanStatus(user.plan.status)})`
                    : 'No active plan — pick one in Plans'
                }
                statusLabel={user?.plan ? humanizePlanStatus(user.plan.status) : 'None'}
                tone={user?.plan ? planTone(user.plan.status) : 'muted'}
              />
            </>
          )}
        </View>

        {/* ── Assistant scope ───────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What the assistant can do</Text>
          {assistantCapabilities.map((cap) => (
            <View key={cap.title} style={styles.capabilityRow}>
              <View style={styles.capabilityIcon}>
                <MaterialIcons name={cap.icon} size={22} color="#1A73E8" />
              </View>
              <View style={styles.capabilityCopy}>
                <Text style={styles.capabilityTitle}>{cap.title}</Text>
                <Text style={styles.capabilityText}>{cap.description}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Upcoming features ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Upcoming features</Text>
            <View style={styles.soonBadge}>
              <Text style={styles.soonBadgeText}>Coming soon</Text>
            </View>
          </View>
          {upcomingFeatures.map((feature) => (
            <View key={feature.title} style={styles.upcomingRow}>
              <View style={styles.upcomingIcon}>
                <MaterialIcons name={feature.icon} size={22} color="#7C4DFF" />
              </View>
              <View style={styles.capabilityCopy}>
                <Text style={styles.capabilityTitle}>{feature.title}</Text>
                <Text style={styles.capabilityText}>{feature.description}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Actions ───────────────────────────────────────────────────────── */}
        <View style={styles.actionsSection} pointerEvents={isLoggingOut ? 'box-none' : 'auto'}>
          <Pressable
            style={styles.actionButton}
            onPress={() => router.push('/settings')}
            disabled={isLoggingOut}>
            <View style={styles.actionIcon}>
              <MaterialIcons name="settings" size={22} color="#1A73E8" />
            </View>
            <View style={styles.actionCopy}>
              <Text style={styles.actionTitle}>Settings</Text>
              <Text style={styles.actionDescription}>
                Manage your CRM connection, OpenAI key, and provider
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#9AA0A6" />
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
                <ActivityIndicator size="small" color="#EA4335" />
              ) : (
                <MaterialIcons name="logout" size={22} color="#EA4335" />
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
              <MaterialIcons name="chevron-right" size={24} color="#F6AEA9" />
            ) : null}
          </Pressable>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

type Tone = 'success' | 'muted' | 'brand' | 'warning';

function StatusPill({
  icon,
  label,
  tone,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  tone: Tone;
}) {
  const pillStyle = TONE_PILL_STYLES[tone];
  return (
    <View style={[styles.statusPill, { backgroundColor: pillStyle.bg, borderColor: pillStyle.border }]}>
      <MaterialIcons name={icon} size={14} color={pillStyle.fg} />
      <Text style={[styles.statusPillText, { color: pillStyle.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
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
  const pillStyle = TONE_PILL_STYLES[tone];
  return (
    <View style={styles.connectionRow}>
      <View style={styles.connectionIcon}>
        <MaterialIcons name={icon} size={22} color="#1A73E8" />
      </View>
      <View style={styles.capabilityCopy}>
        <Text style={styles.capabilityTitle}>{title}</Text>
        <Text style={styles.capabilityText}>{value}</Text>
      </View>
      <View style={[styles.connectionStatus, { backgroundColor: pillStyle.bg }]}>
        <Text style={[styles.connectionStatusText, { color: pillStyle.fg }]} numberOfLines={1}>
          {statusLabel}
        </Text>
      </View>
    </View>
  );
}

function ConnectionRowSkeleton() {
  return (
    <View style={styles.connectionRow}>
      <View style={styles.connectionIcon}>
        <Skeleton width={22} height={22} radius={6} />
      </View>
      <View style={styles.capabilityCopy}>
        <Skeleton width="55%" height={14} radius={6} />
        <Skeleton width="85%" height={11} radius={6} style={{ marginTop: 8 }} />
      </View>
      <Skeleton width={56} height={22} radius={999} />
    </View>
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

function planTone(status: string): Tone {
  if (status === 'active' || status === 'trialing') return 'success';
  if (status === 'past_due' || status === 'unpaid' || status === 'incomplete') return 'warning';
  return 'muted';
}

function formatPlanLabel(name: string, status: string): string {
  return `${name} · ${humanizePlanStatus(status)}`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const TONE_PILL_STYLES: Record<Tone, { bg: string; border: string; fg: string }> = {
  success: { bg: '#E6F4EA', border: '#B7E1C0', fg: '#1E8E3E' },
  muted: { bg: '#F1F3F4', border: '#E0E3E7', fg: '#5F6368' },
  brand: { bg: '#E8F0FE', border: '#C6DAFC', fg: '#1A73E8' },
  warning: { bg: '#FEF7E0', border: '#FCE8B2', fg: '#B06000' },
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 12,
    paddingBottom: 120,
    paddingTop: 24,
  },
  // ── Profile card ──
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 16,
    borderWidth: 1,
    elevation: 3,
    padding: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
  },
  profileHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
  },
  profileHeaderCopy: {
    flex: 1,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  avatarText: {
    color: '#1A73E8',
    fontSize: 24,
    fontWeight: '700',
  },
  name: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 2,
  },
  planBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  planDot: {
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  planBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  profileDivider: {
    backgroundColor: '#F0F1F3',
    height: 1,
    marginBottom: 16,
    marginTop: 18,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusPill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  // ── Sections ──
  section: {
    marginTop: 26,
  },
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#202124',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  soonBadge: {
    backgroundColor: '#EDE7FF',
    borderRadius: 999,
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  soonBadgeText: {
    color: '#5E35B1',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  // ── Connection rows ──
  connectionRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    padding: 14,
  },
  connectionIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  connectionStatus: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  connectionStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  // ── Capability rows ──
  capabilityRow: {
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    padding: 14,
  },
  capabilityIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  capabilityCopy: {
    flex: 1,
  },
  capabilityTitle: {
    color: '#202124',
    fontSize: 16,
    fontWeight: '600',
  },
  capabilityText: {
    color: '#5F6368',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },
  // ── Upcoming rows ──
  upcomingRow: {
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: '#EDE7FF',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    padding: 14,
  },
  upcomingIcon: {
    alignItems: 'center',
    backgroundColor: '#EDE7FF',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  // ── Actions ──
  actionsSection: {
    gap: 12,
    marginTop: 30,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 16,
  },
  logoutButton: {
    borderColor: '#FAD2CF',
  },
  actionButtonDisabled: {
    opacity: 0.65,
  },
  actionIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  logoutIcon: {
    backgroundColor: '#FCE8E6',
  },
  actionCopy: {
    flex: 1,
  },
  actionTitle: {
    color: '#202124',
    fontSize: 16,
    fontWeight: '600',
  },
  logoutTitle: {
    color: '#EA4335',
  },
  actionDescription: {
    color: '#5F6368',
    fontSize: 13,
    marginTop: 3,
  },
});
