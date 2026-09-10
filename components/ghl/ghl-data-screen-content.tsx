import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PageHeader } from '@/components/page-header';
import { GhlCalendarView } from '@/components/ghl/ghl-calendar-view';
import { GhlContactCard } from '@/components/ghl/ghl-contact-card';
import { GhlOpportunityCard } from '@/components/ghl/ghl-opportunity-card';
import { ScreenShell } from '@/components/screen';
import { Skeleton, SkeletonLines } from '@/components/ui/skeleton';
import { UiControlHeights, UiRadii, UiSpacing, UiTypography } from '@/constants/theme';
import { ghlApi } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import {
  crmCacheKey,
  getCrmCache,
  isCrmFresh,
  setCrmCache,
} from '@/lib/api/crm-cache';
import {
  getCachedAppointments,
  isAppointmentsFresh,
  setCachedAppointments,
} from '@/lib/api/reminders-cache';
import { CRM_LABELS, getCrmLabel } from '@/lib/crm/labels';
import type {
  GhlCalendarSummary,
  GhlContactSummary,
  GhlOpportunitySummary,
} from '@/lib/api/types';
import { syncAppointmentNotifications } from '@/lib/push/local-notifications';
import { useRealtimeEvent } from '@/lib/realtime/socket';
import { getUser } from '@/lib/session';
import { useAppTheme } from '@/lib/theme/theme-provider';

type LoadState<T> = {
  data: T[];
  loading: boolean;
  error: string | null;
};

// Seed a section from the CRM cache: show cached rows instantly (no skeleton)
// when present, otherwise start in the loading state until the first fetch.
function seedState<T>(key: string): LoadState<T> {
  const data = getCrmCache<T>(key);
  return { data: data ?? [], loading: data === undefined, error: null };
}

// Persist a successful fetch to the cache, then apply it to component state.
// Errors are shown but not cached, so a transient failure never poisons the
// instant-render path.
function commit<T>(
  key: string,
  st: LoadState<T>,
  setter: (s: LoadState<T>) => void,
): void {
  if (st.error === null) setCrmCache(key, st.data);
  setter(st);
}

// The three GoHighLevel objects this screen can browse. A single screen serves
// both the combined overview (no `object` param) and a focused single-object
// list page (e.g. /ghl?object=contacts) that the Home quick actions link to.
const OBJECT_KEYS = ['contacts', 'opportunities', 'calendar'] as const;
type ObjectKey = (typeof OBJECT_KEYS)[number];

const OBJECT_TITLES: Record<ObjectKey, string> = {
  contacts: 'Contacts',
  opportunities: 'Opportunities',
  calendar: 'Calendars',
};

function isObjectKey(value: unknown): value is ObjectKey {
  return typeof value === 'string' && (OBJECT_KEYS as readonly string[]).includes(value);
}

export function GhlDataScreenContent() {
  const { colors } = useAppTheme();
  const router = useRouter();

  const params = useLocalSearchParams<{ object?: string }>();
  // When a single object is requested, render ONLY that list; otherwise show
  // the combined overview.
  const active = isObjectKey(params.object) ? params.object : null;
  const want = useCallback((key: ObjectKey) => !active || active === key, [active]);
  // A dedicated list page can afford to fetch more rows than the overview.
  const limit = active ? 50 : 10;

  const [contacts, setContacts] = useState<LoadState<GhlContactSummary>>(() =>
    seedState(crmCacheKey('ghl', 'contacts')),
  );
  const [opportunities, setOpportunities] = useState<LoadState<GhlOpportunitySummary>>(
    () => seedState(crmCacheKey('ghl', 'opportunities')),
  );
  const [calendars, setCalendars] = useState<LoadState<GhlCalendarSummary>>(() =>
    seedState(crmCacheKey('ghl', 'calendar')),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [calendarRefreshSignal, setCalendarRefreshSignal] = useState(0);
  const [selectedContact, setSelectedContact] = useState<GhlContactSummary | null>(null);
  const [contactDetailLoading, setContactDetailLoading] = useState(false);
  const [contactDetailError, setContactDetailError] = useState<string | null>(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState<GhlOpportunitySummary | null>(null);
  const [opportunityDetailLoading, setOpportunityDetailLoading] = useState(false);
  const [opportunityDetailError, setOpportunityDetailError] = useState<string | null>(null);

  const loadAll = useCallback(
    async (mode: 'initial' | 'refresh') => {
      const initial = mode === 'initial';
      const kContacts = crmCacheKey('ghl', 'contacts');
      const kOpps = crmCacheKey('ghl', 'opportunities');
      const kCal = crmCacheKey('ghl', 'calendar');

      // Fetch a wanted object unless this is an initial (focus) load and its
      // cache is still fresh. Pull-to-refresh (mode 'refresh') always fetches.
      const need = {
        contacts: want('contacts') && !(initial && isCrmFresh(kContacts)),
        opportunities: want('opportunities') && !(initial && isCrmFresh(kOpps)),
        calendar: want('calendar') && !(initial && isCrmFresh(kCal)),
      };

      if (initial) {
        // Show the skeleton only where there's nothing cached to display.
        setContacts((s) => ({
          ...s,
          loading: want('contacts') && getCrmCache(kContacts) === undefined,
          error: null,
        }));
        setOpportunities((s) => ({
          ...s,
          loading: want('opportunities') && getCrmCache(kOpps) === undefined,
          error: null,
        }));
        setCalendars((s) => ({
          ...s,
          loading: want('calendar') && getCrmCache(kCal) === undefined,
          error: null,
        }));
      }

      // Fetch only the objects that need a network hit, in parallel — one slow
      // surface shouldn't gate the others.
      const [c, o, cal] = await Promise.allSettled([
        need.contacts
          ? ghlApi.listContacts({ limit })
          : Promise.resolve({ contacts: [] }),
        need.opportunities
          ? ghlApi.listOpportunities({ limit })
          : Promise.resolve({ opportunities: [] }),
        need.calendar
          ? ghlApi.listCalendars()
          : Promise.resolve({ calendars: [] }),
      ]);

      if (need.contacts) commit(kContacts, stateFrom(c, (v) => v.contacts), setContacts);
      if (need.opportunities) {
        commit(kOpps, stateFrom(o, (v) => v.opportunities), setOpportunities);
      }
      if (need.calendar) commit(kCal, stateFrom(cal, (v) => v.calendars), setCalendars);
    },
    [want, limit],
  );

  // Appointment alerts live with the calendar, not the reminders list. Pull a
  // forward window and schedule on-device notifications so meetings still ring
  // even if the user never opens Reminders.
  const syncAppointmentAlerts = useCallback(
    async (force = false) => {
      if (!want('calendar')) return;
      const cached = getCachedAppointments();
      if (cached) void syncAppointmentNotifications(cached);
      if (!force && isAppointmentsFresh()) return;
      try {
        const now = Date.now();
        const day = 86_400_000;
        const res = await ghlApi.listCalendarEvents({
          startTime: new Date(now).toISOString(),
          endTime: new Date(now + 180 * day).toISOString(),
        });
        setCachedAppointments(res.appointments);
        void syncAppointmentNotifications(res.appointments);
      } catch {
        // Best-effort; reconciles again on next calendar focus.
      }
    },
    [want],
  );

  useFocusEffect(
    useCallback(() => {
      // Settings / OAuth deep links may have refreshed tokens — fetch fresh
      // data every time the screen comes back into focus.
      void loadAll('initial');
      void syncAppointmentAlerts();
    }, [loadAll, syncAppointmentAlerts]),
  );

  // Refetch a single object without a skeleton flash — keep the current rows
  // visible and swap them in on success (live update).
  const reloadObject = useCallback(
    async (key: ObjectKey) => {
      try {
        if (key === 'contacts') {
          const res = await ghlApi.listContacts({ limit });
          const data = res.contacts ?? [];
          setCrmCache(crmCacheKey('ghl', 'contacts'), data);
          setContacts({ data, loading: false, error: null });
        } else if (key === 'opportunities') {
          const res = await ghlApi.listOpportunities({ limit });
          const data = res.opportunities ?? [];
          setCrmCache(crmCacheKey('ghl', 'opportunities'), data);
          setOpportunities({ data, loading: false, error: null });
        } else if (key === 'calendar') {
          const res = await ghlApi.listCalendars();
          const data = res.calendars ?? [];
          setCrmCache(crmCacheKey('ghl', 'calendar'), data);
          setCalendars({ data, loading: false, error: null });
          setCalendarRefreshSignal((value) => value + 1);
        }
      } catch {
        // Non-fatal: keep the current rows; reconciles on next focus/refresh.
      }
    },
    [limit],
  );

  // Sprint 2: when a chat command mutates GHL data, refetch just the affected
  // object if it's currently rendered on this screen.
  const onCrmInvalidate = useCallback(
    (payload: { provider?: string; object?: string }) => {
      if (payload?.provider !== 'ghl') return;
      const key = payload.object;
      if (!isObjectKey(key) || !want(key)) return;
      void reloadObject(key);
    },
    [want, reloadObject],
  );
  useRealtimeEvent('crm.invalidate', onCrmInvalidate);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await loadAll('refresh');
      setCalendarRefreshSignal((value) => value + 1);
      void syncAppointmentAlerts(true);
    } finally {
      setRefreshing(false);
    }
  }

  function closeContact() {
    setSelectedContact(null);
    setContactDetailLoading(false);
    setContactDetailError(null);
  }

  function closeOpportunity() {
    setSelectedOpportunity(null);
    setOpportunityDetailLoading(false);
    setOpportunityDetailError(null);
  }

  function openContact(row: GhlContactSummary) {
    closeOpportunity();
    setSelectedContact(row);
    setContactDetailError(null);
    setContactDetailLoading(true);
    void ghlApi
      .getContact(row.id)
      .then((detail) => {
        setSelectedContact((current) => (current?.id === row.id ? detail : current));
      })
      .catch((reason) => {
        setContactDetailError(
          reason instanceof ApiError
            ? reason.message
            : reason instanceof Error
              ? reason.message
              : 'Could not load contact details.',
        );
      })
      .finally(() => {
        setContactDetailLoading(false);
      });
  }

  function openOpportunity(row: GhlOpportunitySummary) {
    closeContact();
    setSelectedOpportunity(row);
    setOpportunityDetailError(null);
    setOpportunityDetailLoading(true);
    void ghlApi
      .getOpportunity(row.id)
      .then((detail) => {
        setSelectedOpportunity((current) => (current?.id === row.id ? detail : current));
      })
      .catch((reason) => {
        setOpportunityDetailError(
          reason instanceof ApiError
            ? reason.message
            : reason instanceof Error
              ? reason.message
              : 'Could not load opportunity details.',
        );
      })
      .finally(() => {
        setOpportunityDetailLoading(false);
      });
  }

  // Gate to GHL users. We don't want a non-GHL account opening /ghl from a
  // stale deep link and seeing an empty browse screen.
  const provider = getUser()?.provider;
  if (provider && provider !== 'ghl') {
    return (
      <ScreenShell edges={['bottom']}>
        <PageHeader title={`${CRM_LABELS.ghl} data`} showBack onBack={() => router.back()} />
        <View style={styles.notFor}>
          <MaterialIcons name="info-outline" size={40} color={colors.icon} />
          <Text style={styles.notForTitle}>{CRM_LABELS.ghl} only</Text>
          <Text style={styles.notForText}>
            This view shows {CRM_LABELS.ghl} contacts, opportunities, and calendars. Your
            account is on {getCrmLabel(provider)} — switch CRMs in Settings.
          </Text>
          <Pressable
            style={[styles.notForButton, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/settings/crm')}>
            <Text style={[styles.notForButtonText, { color: colors.onPrimary }]}>
              Open CRM provider
            </Text>
          </Pressable>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell edges={['bottom']}>
      <PageHeader
        title={active ? `${CRM_LABELS.ghl} ${OBJECT_TITLES[active]}` : `${CRM_LABELS.ghl} data`}
        showBack
        onBack={() => router.back()}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
          tintColor={colors.primary}
          />
        }>
        {want('contacts') && (
          <Section
            icon="people"
            title="Contacts"
            state={contacts}
            emptyText="No contacts in your GoHighLevel account yet."
            renderRow={(row) => (
              <RowCard
                key={row.id}
                title={row.name}
                subtitle={[row.email, row.phone].filter(Boolean).join(' · ') || undefined}
                trailingIcon="chevron-right"
                onPress={() => openContact(row)}
              />
            )}
          />
        )}

        {want('opportunities') && (
          <Section
            icon="business-center"
            title="Opportunities"
            state={opportunities}
            emptyText="No opportunities in your GoHighLevel account yet."
            renderRow={(row) => (
              <RowCard
                key={row.id}
                title={row.name}
                subtitle={
                  [
                    typeof row.monetaryValue === 'number'
                      ? `$${row.monetaryValue.toLocaleString()}`
                      : undefined,
                    row.contactName,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
                meta={
                  [
                    formatOpportunityStatus(row.status),
                    row.pipelineStageName || row.pipelineName,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
                trailingIcon="chevron-right"
                onPress={() => openOpportunity(row)}
              />
            )}
          />
        )}

        {want('calendar') && (
          <GhlCalendarView
            calendars={calendars}
            variant={active === 'calendar' ? 'page' : 'preview'}
            refreshSignal={calendarRefreshSignal}
          />
        )}

        <Text style={styles.footnote}>
          Read-only browse view. Use the chat assistant for search and conversational
          queries against the same data.
        </Text>
      </ScrollView>

      <DetailSheet
        visible={!!selectedContact}
        title={selectedContact?.name || 'Contact'}
        closeLabel="Close contact"
        loading={contactDetailLoading}
        loadingText="Loading contact details…"
        error={contactDetailError}
        onClose={closeContact}>
        {selectedContact ? <GhlContactCard contact={selectedContact} /> : null}
      </DetailSheet>

      <DetailSheet
        visible={!!selectedOpportunity}
        title={selectedOpportunity?.name || 'Opportunity'}
        closeLabel="Close opportunity"
        loading={opportunityDetailLoading}
        loadingText="Loading opportunity details…"
        error={opportunityDetailError}
        onClose={closeOpportunity}>
        {selectedOpportunity ? <GhlOpportunityCard opportunity={selectedOpportunity} /> : null}
      </DetailSheet>
    </ScreenShell>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// GHL list endpoints wrap their rows under different keys (contacts /
// opportunities / appointments), so `pick` pulls the array out of whichever
// shape a given call returns.
function stateFrom<R, T>(
  settled: PromiseSettledResult<R>,
  pick: (value: R) => T[],
): LoadState<T> {
  if (settled.status === 'fulfilled') {
    return { data: pick(settled.value) ?? [], loading: false, error: null };
  }
  const reason = settled.reason;
  const message =
    reason instanceof ApiError
      ? reason.message
      : reason instanceof Error
        ? reason.message
        : 'Could not load from GoHighLevel.';
  return { data: [], loading: false, error: message };
}

// ─── Section ──────────────────────────────────────────────────────────────────

type SectionProps<T> = {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  state: LoadState<T>;
  emptyText: string;
  skeletonLines?: number;
  renderRow: (row: T) => ReactNode;
};

function Section<T>({ icon, title, state, emptyText, skeletonLines = 2, renderRow }: SectionProps<T>) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <MaterialIcons name={icon} size={18} color={colors.primary} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!state.loading && state.error === null ? (
          <Text style={styles.sectionCount}>
            {state.data.length} {state.data.length === 1 ? 'item' : 'items'}
          </Text>
        ) : null}
      </View>

      <View style={styles.sectionBody}>
        {state.loading ? (
          <SectionSkeleton lines={skeletonLines} />
        ) : state.error ? (
          <View style={styles.errorCard}>
            <MaterialIcons name="error-outline" size={18} color={colors.danger} />
            <Text style={styles.errorText}>{state.error}</Text>
          </View>
        ) : state.data.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{emptyText}</Text>
          </View>
        ) : (
          state.data.map((row) => renderRow(row))
        )}
      </View>
    </View>
  );
}

function SectionSkeleton({ lines }: { lines: number }) {
  return (
    <View style={{ gap: 10 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <Skeleton width="60%" height={14} radius={6} />
          <SkeletonLines lines={lines} lineHeight={10} gap={6} lastLineWidth="40%" />
        </View>
      ))}
    </View>
  );
}

function formatOpportunityStatus(status?: string): string | undefined {
  const trimmed = status?.trim();
  if (!trimmed) return undefined;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

type DetailSheetProps = {
  visible: boolean;
  title: string;
  closeLabel: string;
  loading: boolean;
  loadingText: string;
  error: string | null;
  onClose: () => void;
  children: ReactNode;
};

function DetailSheet({
  visible,
  title,
  closeLabel,
  loading,
  loadingText,
  error,
  onClose,
  children,
}: DetailSheetProps) {
  const { colors } = useAppTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(event) => event.stopPropagation()}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {title}
            </Text>
            <Pressable
              accessibilityLabel={closeLabel}
              hitSlop={8}
              onPress={onClose}
              style={styles.sheetClose}>
              <MaterialIcons name="close" size={20} color={colors.icon} />
            </Pressable>
          </View>
          {loading ? (
            <View style={styles.sheetLoading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.sheetHint, { color: colors.textSecondary }]}>{loadingText}</Text>
            </View>
          ) : null}
          {error ? (
            <Text style={[styles.sheetError, { color: colors.danger }]}>{error}</Text>
          ) : null}
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetScrollContent}>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── RowCard ──────────────────────────────────────────────────────────────────

type RowCardProps = {
  title: string;
  subtitle?: string;
  meta?: string;
  trailingIcon?: keyof typeof MaterialIcons.glyphMap;
  onPress?: () => void;
};

function RowCard({
  title,
  subtitle,
  meta,
  trailingIcon = 'content-copy',
  onPress,
}: RowCardProps) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.rowCard, pressed && { opacity: 0.85 }]}>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text style={styles.rowMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      <MaterialIcons name={trailingIcon} size={16} color={colors.icon} />
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    gap: UiSpacing.lg,
    maxWidth: 720,
    paddingBottom: UiSpacing.xxxl,
    paddingHorizontal: UiSpacing.lg,
    paddingTop: UiSpacing.sm,
    width: '100%',
  },

  section: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionHeader: {
    alignItems: 'center',
    backgroundColor: '#F8FAFF',
    borderBottomColor: '#E8EAED',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    paddingHorizontal: UiSpacing.md,
    paddingVertical: UiSpacing.sm,
  },
  sectionIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: UiRadii.icon,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  sectionTitle: {
    color: '#202124',
    flex: 1,
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  sectionCount: {
    color: '#80868B',
    fontSize: UiTypography.label.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.label.lineHeight,
  },
  sectionBody: {
    gap: UiSpacing.sm,
    padding: UiSpacing.md,
  },

  rowCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#EEF0F3',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    minHeight: 52,
    paddingHorizontal: UiSpacing.md,
    paddingVertical: UiSpacing.sm,
  },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { color: '#202124', fontSize: UiTypography.bodySmall.fontSize, fontWeight: '600', lineHeight: UiTypography.bodySmall.lineHeight },
  rowSubtitle: { color: '#5F6368', fontSize: UiTypography.label.fontSize, lineHeight: UiTypography.label.lineHeight },
  rowMeta: { color: '#80868B', fontSize: UiTypography.caption.fontSize, lineHeight: UiTypography.caption.lineHeight },

  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#F8FAFF',
    borderRadius: UiRadii.card,
    paddingHorizontal: UiSpacing.md,
    paddingVertical: UiSpacing.lg,
  },
  emptyText: { color: '#5F6368', fontSize: UiTypography.label.fontSize, lineHeight: UiTypography.label.lineHeight, textAlign: 'center' },

  errorCard: {
    alignItems: 'flex-start',
    backgroundColor: '#FDEDED',
    borderColor: '#F5C2C7',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    padding: UiSpacing.md,
  },
  errorText: { color: '#5F2120', flex: 1, fontSize: UiTypography.label.fontSize, lineHeight: UiTypography.label.lineHeight },

  skeletonRow: {
    backgroundColor: '#F8FAFF',
    borderRadius: UiRadii.card,
    gap: UiSpacing.sm,
    padding: UiSpacing.md,
  },

  notFor: {
    alignItems: 'center',
    gap: UiSpacing.md,
    padding: UiSpacing.xxxl,
  },
  notForTitle: { color: '#202124', fontSize: UiTypography.cardHeading.fontSize, fontWeight: '600', lineHeight: UiTypography.cardHeading.lineHeight },
  notForText: {
    color: '#5F6368',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    maxWidth: 280,
    textAlign: 'center',
  },
  notForButton: {
    borderRadius: UiRadii.control,
    marginTop: UiSpacing.sm,
    paddingHorizontal: UiSpacing.lg,
    paddingVertical: UiSpacing.sm,
  },
  notForButtonText: {
    fontSize: UiTypography.button.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.button.lineHeight,
  },

  footnote: {
    color: '#80868B',
    fontSize: UiTypography.caption.fontSize,
    lineHeight: UiTypography.caption.lineHeight,
    paddingHorizontal: UiSpacing.xxs,
    textAlign: 'center',
  },

  sheetOverlay: {
    backgroundColor: 'rgba(15,23,42,0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    alignSelf: 'center',
    borderTopLeftRadius: UiRadii.modal,
    borderTopRightRadius: UiRadii.modal,
    borderTopWidth: 1,
    maxHeight: '88%',
    maxWidth: 720,
    paddingBottom: UiSpacing.xxl,
    paddingHorizontal: UiSpacing.lg,
    paddingTop: 8,
    width: '100%',
  },
  sheetHandle: {
    alignSelf: 'center',
    borderRadius: 2,
    height: 4,
    marginBottom: UiSpacing.md,
    width: 40,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: UiSpacing.sm,
    marginBottom: UiSpacing.sm,
  },
  sheetTitle: {
    flex: 1,
    fontSize: UiTypography.sectionHeading.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.sectionHeading.lineHeight,
  },
  sheetClose: {
    alignItems: 'center',
    height: UiControlHeights.iconButton,
    justifyContent: 'center',
    width: UiControlHeights.iconButton,
  },
  sheetLoading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: UiSpacing.sm,
    marginBottom: UiSpacing.sm,
  },
  sheetHint: {
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
  },
  sheetError: {
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
    marginBottom: UiSpacing.sm,
  },
  sheetScroll: { maxHeight: '100%' },
  sheetScrollContent: { paddingBottom: UiSpacing.lg },
});
