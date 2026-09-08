import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PageHeader } from '@/components/page-header';
import { ScreenShell } from '@/components/screen';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { CreateReminderModal } from '@/components/reminders/create-reminder-modal';
import { ReminderRow } from '@/components/reminders/reminder-row';
import {
  UiControlHeights,
  UiRadii,
  UiSpacing,
  UiTypography,
} from '@/constants/theme';
import { ghlApi, remindersApi } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import {
  getCachedAppointments,
  getCachedReminders,
  invalidateRemindersExcept,
  isAppointmentsFresh,
  isRemindersFresh,
  setCachedAppointments,
  setCachedReminders,
} from '@/lib/api/reminders-cache';
import type {
  GhlAppointmentSummary,
  Reminder,
  ReminderListRange,
  SnoozePreset,
} from '@/lib/api/types';
import {
  cancelReminderNotification,
  scheduleReminderNotification,
  syncAppointmentNotifications,
  syncReminderNotifications,
} from '@/lib/push/local-notifications';
import { usePushState } from '@/lib/push/state';
import { useRealtimeEvent } from '@/lib/realtime/socket';
import { getUser } from '@/lib/session';
import { useAppTheme } from '@/lib/theme/theme-provider';
import { useToast } from '@/lib/toast';

type Feature = 'reminders' | 'appointments';
type ReminderTab = ReminderListRange | 'all';
type ApptTab = 'upcoming' | 'cancelled' | 'all';

const REMINDER_TABS: { key: ReminderTab; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'all', label: 'All' },
];

const APPT_TABS: { key: ApptTab; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
];

const SNOOZE_OPTIONS: { preset: SnoozePreset; label: string }[] = [
  { preset: '10m', label: 'Snooze 10 minutes' },
  { preset: '1h', label: 'Snooze 1 hour' },
  { preset: 'tomorrow9', label: 'Snooze until tomorrow 9 AM' },
];

type MenuAction = {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};

function isCancelledAppt(appt: GhlAppointmentSummary): boolean {
  return /cancel/i.test(appt.status ?? '');
}

function isUserReminder(reminder: Reminder): boolean {
  return reminder.linkType !== 'APPOINTMENT';
}

export function RemindersScreenContent() {
  const { show } = useToast();
  const { colors } = useAppTheme();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const pushState = usePushState();
  const isGhl = getUser()?.provider === 'ghl';

  const [feature, setFeature] = useState<Feature>(isGhl ? 'appointments' : 'reminders');
  const [reminderRange, setReminderRange] = useState<ReminderTab>('upcoming');
  const [apptRange, setApptRange] = useState<ApptTab>('upcoming');
  const [items, setItems] = useState<Reminder[]>(
    () => getCachedReminders('upcoming') ?? [],
  );
  const [appointments, setAppointments] = useState<GhlAppointmentSummary[]>(
    () => getCachedAppointments() ?? [],
  );
  const [loading, setLoading] = useState(() =>
    isGhl ? !getCachedAppointments() : !getCachedReminders('upcoming'),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [menuReminder, setMenuReminder] = useState<Reminder | null>(null);

  const applyItems = useCallback(
    (updater: (prev: Reminder[]) => Reminder[]) => {
      setItems((prev) => {
        const next = updater(prev);
        setCachedReminders(reminderRange, next);
        invalidateRemindersExcept(reminderRange);
        return next;
      });
    },
    [reminderRange],
  );

  const loadReminders = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      const cached = getCachedReminders(reminderRange);
      if (cached) {
        setItems(cached);
        if (!isGhl) setLoading(false);
      } else if (mode === 'initial' && !isGhl) {
        setLoading(true);
      }
      if (mode === 'initial' && isRemindersFresh(reminderRange)) {
        if (!isGhl) setLoading(false);
        return;
      }
      try {
        let data: Reminder[] = [];
        if (reminderRange === 'all') {
          const [upcoming, past] = await Promise.all([
            remindersApi.listReminders('upcoming'),
            remindersApi.listReminders('past'),
          ]);
          const byId = new Map<string, Reminder>();
          for (const reminder of [...upcoming, ...past]) byId.set(reminder.id, reminder);
          data = [...byId.values()];
        } else {
          data = await remindersApi.listReminders(reminderRange);
        }
        setItems(data);
        setCachedReminders(reminderRange, data);
      } catch (err) {
        if (!cached && feature === 'reminders') {
          show(
            err instanceof ApiError ? err.message : 'Could not load reminders.',
            'error',
          );
        }
      } finally {
        if (!isGhl) setLoading(false);
      }
    },
    [feature, isGhl, reminderRange, show],
  );

  const loadAppointments = useCallback(
    async (force = false) => {
      if (!isGhl) {
        setAppointments([]);
        setLoading(false);
        return;
      }
      const cached = getCachedAppointments();
      if (cached) {
        setAppointments(cached);
        setLoading(false);
      }
      if (!force && isAppointmentsFresh()) {
        setLoading(false);
        return;
      }
      try {
        const now = Date.now();
        const day = 86_400_000;
        const res = await ghlApi.listCalendarEvents({
          startTime: new Date(now - 3650 * day).toISOString(),
          endTime: new Date(now + 730 * day).toISOString(),
        });
        setAppointments(res.appointments);
        setCachedAppointments(res.appointments);
        void syncAppointmentNotifications(res.appointments);
      } catch {
        if (!cached) setAppointments([]);
      } finally {
        setLoading(false);
      }
    },
    [isGhl],
  );

  const syncLocal = useCallback(async () => {
    try {
      const upcoming = await remindersApi.listReminders('upcoming');
      await syncReminderNotifications(upcoming);
    } catch {
      // Best-effort; reconciles again on next focus.
    }
  }, []);

  const refreshAll = useCallback(() => {
    setRefreshing(true);
    void Promise.all([loadReminders('refresh'), loadAppointments(true)]).finally(() => {
      setRefreshing(false);
    });
  }, [loadAppointments, loadReminders]);

  useFocusEffect(
    useCallback(() => {
      void loadReminders('initial');
      void loadAppointments();
      void syncLocal();
    }, [loadAppointments, loadReminders, syncLocal]),
  );

  const onReminderChanged = useCallback(() => {
    void loadReminders('refresh');
    void loadAppointments(true);
    void syncLocal();
  }, [loadAppointments, loadReminders, syncLocal]);
  useRealtimeEvent('reminder.changed', onReminderChanged);

  const reminderRows = useMemo(() => {
    const rows = items.filter(isUserReminder);
    rows.sort((left, right) =>
      reminderRange === 'upcoming'
        ? left.dueAt.localeCompare(right.dueAt)
        : right.dueAt.localeCompare(left.dueAt),
    );
    return rows;
  }, [items, reminderRange]);

  const appointmentRows = useMemo(() => {
    const now = Date.now();
    const rows = appointments.filter((appt) => {
      const start = appt.startTime ? Date.parse(appt.startTime) : NaN;
      if (Number.isNaN(start)) return false;
      if (apptRange === 'cancelled') return isCancelledAppt(appt);
      if (apptRange === 'upcoming') return !isCancelledAppt(appt) && start >= now;
      return true;
    });
    rows.sort((left, right) => {
      const leftAt = Date.parse(left.startTime as string);
      const rightAt = Date.parse(right.startTime as string);
      return apptRange === 'upcoming' ? leftAt - rightAt : rightAt - leftAt;
    });
    return rows;
  }, [appointments, apptRange]);

  function onCreated(r: Reminder) {
    applyItems((prev) =>
      [r, ...prev].sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
    );
    void scheduleReminderNotification(r);
  }

  function onUpdated(r: Reminder) {
    applyItems((prev) =>
      prev
        .map((x) => (x.id === r.id ? r : x))
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
    );
    void scheduleReminderNotification(r);
  }

  function openCreate() {
    setEditing(null);
    setModalVisible(true);
  }

  function openEdit(r: Reminder) {
    setEditing(r);
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setEditing(null);
  }

  async function snooze(r: Reminder, preset: SnoozePreset) {
    try {
      const updated = await remindersApi.snoozeReminder(r.id, { preset });
      applyItems((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
      void scheduleReminderNotification(updated);
      show('Snoozed.', 'success');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not snooze.', 'error');
    }
  }

  async function dismiss(r: Reminder) {
    try {
      await remindersApi.dismissReminder(r.id);
      applyItems((prev) => prev.filter((x) => x.id !== r.id));
      void cancelReminderNotification(r.id);
      show('Marked done.', 'success');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not dismiss.', 'error');
    }
  }

  async function remove(r: Reminder) {
    try {
      await remindersApi.deleteReminder(r.id);
      applyItems((prev) => prev.filter((x) => x.id !== r.id));
      void cancelReminderNotification(r.id);
      show('Deleted.', 'success');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not delete.', 'error');
    }
  }

  function openMenu(r: Reminder) {
    setMenuReminder(r);
  }

  const menuActions: MenuAction[] = menuReminder
    ? [
        { label: 'Edit', icon: 'edit', onPress: () => openEdit(menuReminder) },
        ...SNOOZE_OPTIONS.map<MenuAction>((s) => ({
          label: s.label,
          icon: 'snooze',
          onPress: () => void snooze(menuReminder, s.preset),
        })),
        {
          label: 'Mark done',
          icon: 'check-circle',
          onPress: () => void dismiss(menuReminder),
        },
        {
          label: 'Delete',
          icon: 'delete',
          destructive: true,
          onPress: () => void remove(menuReminder),
        },
      ]
    : [];

  const pushDenied = pushState.status === 'denied';
  const showingReminders = feature === 'reminders';
  const listEmpty = showingReminders
    ? reminderRows.length === 0
    : appointmentRows.length === 0;

  if (loading) {
    return <PageSkeleton title="Reminders" />;
  }

  return (
    <ScreenShell edges={['bottom']}>
      <PageHeader title="Reminders" showBack />

      {isGhl ? (
        <View style={styles.featureRow}>
          <Pressable
            onPress={() => setFeature('reminders')}
            style={[styles.featureTab, showingReminders && styles.featureTabActive]}>
            <Text style={[styles.featureText, showingReminders && styles.featureTextActive]}>
              Reminders
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setFeature('appointments')}
            style={[styles.featureTab, !showingReminders && styles.featureTabActive]}>
            <Text style={[styles.featureText, !showingReminders && styles.featureTextActive]}>
              Appointments
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.tabs}>
        {showingReminders
          ? REMINDER_TABS.map((tab) => (
              <Pressable
                key={tab.key}
                style={[styles.tab, reminderRange === tab.key && styles.tabActive]}
                onPress={() => setReminderRange(tab.key)}>
                <Text
                  style={[styles.tabText, reminderRange === tab.key && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            ))
          : APPT_TABS.map((tab) => (
              <Pressable
                key={tab.key}
                style={[styles.tab, apptRange === tab.key && styles.tabActive]}
                onPress={() => setApptRange(tab.key)}>
                <Text style={[styles.tabText, apptRange === tab.key && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
      </View>

      {showingReminders && Platform.OS === 'web' ? (
        <View style={styles.webBanner}>
          <MaterialIcons name="info-outline" size={16} color={colors.info} />
          <Text style={styles.webBannerText}>
            Push notifications are mobile-only. Reminders you create here will
            save but only fire on the iOS / Android app.
          </Text>
        </View>
      ) : showingReminders && pushDenied ? (
        <View style={styles.deniedBanner}>
          <MaterialIcons name="notifications-off" size={16} color={colors.danger} />
          <Text style={styles.deniedBannerText}>
            Reminders will not notify until you re-enable notifications in
            Settings.
          </Text>
          <Pressable onPress={() => void Linking.openSettings()}>
            <Text style={styles.deniedBannerCta}>Open Settings</Text>
          </Pressable>
        </View>
      ) : null}

      {listEmpty ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>
            {showingReminders
              ? reminderRange === 'past'
                ? 'No past reminders'
                : reminderRange === 'all'
                  ? 'Nothing here yet'
                  : 'No upcoming reminders'
              : apptRange === 'cancelled'
                ? 'No cancelled appointments'
                : apptRange === 'all'
                  ? 'No appointments yet'
                  : 'No upcoming appointments'}
          </Text>
          <Text style={styles.emptyBody}>
            {showingReminders
              ? reminderRange === 'past'
                ? 'Completed and expired reminders will appear here.'
                : 'Tap + to set a reminder. GoHighLevel meetings are under Appointments.'
              : apptRange === 'cancelled'
                ? 'Cancelled GoHighLevel appointments will appear here.'
                : 'Appointments from your GoHighLevel calendars will appear here.'}
          </Text>
        </View>
      ) : showingReminders ? (
        <FlatList
          data={reminderRows}
          contentContainerStyle={styles.listContent}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ReminderRow
              reminder={item}
              focused={focus === item.id}
              onPress={() => openMenu(item)}
              onMore={() => openMenu(item)}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refreshAll} />
          }
        />
      ) : (
        <FlatList
          data={appointmentRows}
          contentContainerStyle={styles.listContent}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <AppointmentRow appt={item} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refreshAll} />
          }
        />
      )}

      {showingReminders ? (
        <Pressable
          style={styles.fab}
          onPress={openCreate}
          accessibilityLabel="Create reminder"
          accessibilityRole="button">
          <MaterialIcons name="add" size={28} color={colors.onPrimary} />
        </Pressable>
      ) : null}

      <CreateReminderModal
        visible={modalVisible}
        onClose={closeModal}
        onCreated={onCreated}
        reminder={editing}
        onUpdated={onUpdated}
      />

      <Modal
        visible={!!menuReminder}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuReminder(null)}>
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setMenuReminder(null)}>
          <Pressable style={styles.menuSheet}>
            <View style={styles.handle} />
            <Text style={styles.menuTitle} numberOfLines={1}>
              {menuReminder?.title}
            </Text>
            {menuActions.map((action) => (
              <Pressable
                key={action.label}
                style={styles.menuItem}
                onPress={() => {
                  setMenuReminder(null);
                  action.onPress();
                }}>
                <MaterialIcons
                  name={action.icon}
                  size={20}
                  color={action.destructive ? colors.danger : colors.icon}
                />
                <Text
                  style={[
                    styles.menuItemText,
                    action.destructive && styles.menuItemTextDanger,
                  ]}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
            <Pressable
              style={[styles.menuItem, styles.menuCancel]}
              onPress={() => setMenuReminder(null)}>
              <Text style={styles.menuCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenShell>
  );
}

function AppointmentRow({ appt }: { appt: GhlAppointmentSummary }) {
  const { colors } = useAppTheme();
  const time = formatApptTime(appt.startTime);
  const cancelled = isCancelledAppt(appt);
  return (
    <View style={styles.apptRow}>
      <View style={[styles.apptIcon, cancelled && styles.apptIconCancelled]}>
        <MaterialIcons
          name={cancelled ? 'event-busy' : 'event'}
          size={18}
          color={cancelled ? colors.danger : colors.primary}
        />
      </View>
      <View style={styles.apptCopy}>
        <Text
          style={[styles.apptTitle, cancelled && styles.apptTitleCancelled]}
          numberOfLines={1}>
          {appt.title || 'Appointment'}
        </Text>
        <View style={styles.apptMetaRow}>
          {time ? <Text style={styles.apptTime}>{time}</Text> : null}
          <View style={styles.apptChip}>
            <Text style={styles.apptChipText}>GoHighLevel</Text>
          </View>
          {appt.status ? (
            <Text
              style={[styles.apptStatus, cancelled && styles.apptStatusCancelled]}>
              {appt.status}
            </Text>
          ) : null}
        </View>
        <ApptDetail icon="person" value={appt.contactName} />
        <ApptDetail icon="event-note" value={appt.calendarName} />
        <ApptDetail icon="badge" value={appt.ownerName} />
      </View>
    </View>
  );
}

function ApptDetail({
  icon,
  value,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  value?: string | null;
}) {
  const { colors } = useAppTheme();
  if (!value) return null;
  return (
    <View style={styles.apptDetailRow}>
      <MaterialIcons name={icon} size={13} color={colors.icon} />
      <Text style={styles.apptDetailText} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function formatApptTime(start?: string): string | undefined {
  if (!start) return undefined;
  const m = start.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  const date = m
    ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
    : new Date(start);
  if (Number.isNaN(date.getTime())) return undefined;
  const day = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const clock = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${day} · ${clock}`;
}

const styles = StyleSheet.create({
  listContent: {
    alignSelf: 'center',
    maxWidth: 720,
    width: '100%',
  },
  featureRow: {
    alignSelf: 'center',
    flexDirection: 'row',
    gap: UiSpacing.sm,
    maxWidth: 720,
    paddingHorizontal: UiSpacing.lg,
    paddingTop: UiSpacing.sm,
    width: '100%',
  },
  featureTab: {
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: UiRadii.control,
    flex: 1,
    justifyContent: 'center',
    minHeight: UiControlHeights.button,
  },
  featureTabActive: { backgroundColor: '#1F49E0' },
  featureText: {
    color: '#5B6B82',
    fontSize: UiTypography.button.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.button.lineHeight,
  },
  featureTextActive: { color: 'white' },
  tabs: {
    alignSelf: 'center',
    flexDirection: 'row',
    gap: UiSpacing.sm,
    maxWidth: 720,
    paddingHorizontal: UiSpacing.lg,
    paddingVertical: UiSpacing.sm,
    width: '100%',
  },
  tab: {
    alignItems: 'center',
    backgroundColor: 'white',
    borderColor: '#E5EAF5',
    borderRadius: UiRadii.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: UiControlHeights.compactButton,
  },
  tabActive: { backgroundColor: '#1F49E0', borderColor: '#1F49E0' },
  tabText: {
    color: '#5B6B82',
    fontSize: UiTypography.button.fontSize,
    fontWeight: '500',
    lineHeight: UiTypography.button.lineHeight,
  },
  tabTextActive: { color: 'white' },
  webBanner: {
    alignItems: 'flex-start',
    backgroundColor: '#EEF3FF',
    borderRadius: UiRadii.card,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    marginBottom: UiSpacing.sm,
    marginHorizontal: 16,
    padding: UiSpacing.md,
  },
  webBannerText: {
    color: '#0F172A',
    flex: 1,
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
  },
  deniedBanner: {
    alignItems: 'center',
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    marginBottom: UiSpacing.sm,
    marginHorizontal: 16,
    padding: UiSpacing.md,
  },
  deniedBannerText: {
    color: '#7F1D1D',
    flex: 1,
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
  },
  deniedBannerCta: {
    color: '#B91C1C',
    fontSize: UiTypography.label.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.label.lineHeight,
  },
  apptRow: {
    alignItems: 'center',
    backgroundColor: 'white',
    borderBottomColor: '#E5EAF5',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: UiSpacing.md,
    minHeight: 64,
    paddingHorizontal: UiSpacing.lg,
    paddingVertical: UiSpacing.sm,
  },
  apptIcon: {
    alignItems: 'center',
    backgroundColor: '#EEF3FF',
    borderRadius: UiRadii.icon,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  apptIconCancelled: { backgroundColor: '#FEE2E2' },
  apptCopy: { flex: 1, gap: UiSpacing.xxs },
  apptTitle: {
    color: '#0F172A',
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  apptTitleCancelled: {
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  apptMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: UiSpacing.sm,
  },
  apptTime: {
    color: '#1F49E0',
    fontSize: UiTypography.label.fontSize,
    fontWeight: '500',
    lineHeight: UiTypography.label.lineHeight,
  },
  apptChip: {
    backgroundColor: '#EEF3FF',
    borderRadius: UiRadii.pill,
    paddingHorizontal: UiSpacing.sm,
    paddingVertical: UiSpacing.xxs,
  },
  apptChipText: {
    color: '#1F49E0',
    fontSize: UiTypography.caption.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.caption.lineHeight,
  },
  apptStatus: {
    color: '#5B6B82',
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
    textTransform: 'capitalize',
  },
  apptStatusCancelled: { color: '#B91C1C', fontWeight: '600' },
  apptDetailRow: { alignItems: 'center', flexDirection: 'row', gap: UiSpacing.xs },
  apptDetailText: {
    color: '#5B6B82',
    flex: 1,
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
  },
  menuOverlay: {
    backgroundColor: 'rgba(15,23,42,0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  menuSheet: {
    alignSelf: 'center',
    backgroundColor: 'white',
    borderTopLeftRadius: UiRadii.modal,
    borderTopRightRadius: UiRadii.modal,
    maxWidth: 640,
    paddingBottom: UiSpacing.xxl,
    paddingHorizontal: UiSpacing.md,
    paddingTop: 8,
    width: '100%',
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: '#E5EAF5',
    borderRadius: 2,
    height: 4,
    marginBottom: UiSpacing.md,
    width: 40,
  },
  menuTitle: {
    color: '#0F172A',
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.bodySmall.lineHeight,
    marginBottom: UiSpacing.sm,
    paddingHorizontal: UiSpacing.md,
  },
  menuItem: {
    alignItems: 'center',
    borderRadius: UiRadii.control,
    flexDirection: 'row',
    gap: UiSpacing.md,
    minHeight: UiControlHeights.button,
    paddingHorizontal: UiSpacing.md,
  },
  menuItemText: {
    color: '#0F172A',
    fontSize: UiTypography.button.fontSize,
    fontWeight: '500',
    lineHeight: UiTypography.button.lineHeight,
  },
  menuItemTextDanger: { color: '#B91C1C' },
  menuCancel: {
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    marginTop: UiSpacing.xs,
  },
  menuCancelText: {
    color: '#0F172A',
    fontSize: UiTypography.button.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.button.lineHeight,
  },
  emptyState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: UiSpacing.xxxl,
  },
  emptyTitle: {
    color: '#0F172A',
    fontSize: UiTypography.cardHeading.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.cardHeading.lineHeight,
    marginBottom: UiSpacing.sm,
  },
  emptyBody: {
    color: '#5B6B82',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    textAlign: 'center',
  },
  fab: {
    alignItems: 'center',
    backgroundColor: '#1F49E0',
    borderRadius: UiRadii.pill,
    bottom: 24,
    elevation: 4,
    height: 48,
    justifyContent: 'center',
    position: 'absolute',
    right: 24,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    width: 48,
  },
});
