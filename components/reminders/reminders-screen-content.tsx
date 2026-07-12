import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { CreateReminderModal } from '@/components/reminders/create-reminder-modal';
import { ReminderRow } from '@/components/reminders/reminder-row';
import { ghlApi, remindersApi } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import type {
  GhlAppointmentSummary,
  Reminder,
  ReminderListRange,
  SnoozePreset,
} from '@/lib/api/types';
import {
  cancelReminderNotification,
  scheduleReminderNotification,
  syncReminderNotifications,
} from '@/lib/push/local-notifications';
import { usePushState } from '@/lib/push/state';
import { getUser } from '@/lib/session';
import { useToast } from '@/lib/toast';

const RANGES: { key: ReminderListRange; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
];

const SNOOZE_OPTIONS: { preset: SnoozePreset; label: string }[] = [
  { preset: '10m', label: 'Snooze 10 minutes' },
  { preset: '1h', label: 'Snooze 1 hour' },
  { preset: 'tomorrow9', label: 'Snooze until tomorrow 9 AM' },
];

// A row in the merged reminders list: either a user/CRM reminder or a
// GoHighLevel calendar appointment surfaced live.
type ListItem =
  | { kind: 'reminder'; key: string; sortAt: number; reminder: Reminder }
  | { kind: 'appointment'; key: string; sortAt: number; appt: GhlAppointmentSummary };

type MenuAction = {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};

export function RemindersScreenContent() {
  const { show } = useToast();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const pushState = usePushState();

  // GoHighLevel appointments are surfaced live in the reminders list (across
  // all tabs) so the user can see their schedule here, not just get notified.
  const isGhl = getUser()?.provider === 'ghl';

  const [range, setRange] = useState<ReminderListRange>('upcoming');
  const [items, setItems] = useState<Reminder[]>([]);
  const [appointments, setAppointments] = useState<GhlAppointmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  // When set, the modal opens in edit mode for this reminder.
  const [editing, setEditing] = useState<Reminder | null>(null);
  // When set, the action menu (edit / snooze / done / delete) is shown for it.
  const [menuReminder, setMenuReminder] = useState<Reminder | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      try {
        const data = await remindersApi.listReminders(range);
        setItems(data);
      } catch (err) {
        show(
          err instanceof ApiError ? err.message : 'Could not load reminders.',
          'error',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [range, show],
  );

  // Pull the user's GoHighLevel appointments across a wide window (recent past
  // → near future) once per focus; the visible tab filters them client-side.
  const loadAppointments = useCallback(async () => {
    if (!isGhl) {
      setAppointments([]);
      return;
    }
    try {
      const now = Date.now();
      const res = await ghlApi.listCalendarEvents({
        startTime: new Date(now - 30 * 86_400_000).toISOString(),
        endTime: new Date(now + 60 * 86_400_000).toISOString(),
      });
      setAppointments(res.appointments);
    } catch {
      // Non-fatal: reminders still render without the appointment rows.
      setAppointments([]);
    }
  }, [isGhl]);

  // Keep on-device local notifications in sync with the server. Runs on every
  // focus regardless of the visible tab, using the full "upcoming" set so the
  // device rings even when push isn't delivered (offline, missing FCM/APNs).
  const syncLocal = useCallback(async () => {
    try {
      const upcoming = await remindersApi.listReminders('upcoming');
      await syncReminderNotifications(upcoming);
    } catch {
      // Best-effort; reconciles again on next focus.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load('initial');
      void loadAppointments();
      void syncLocal();
    }, [load, loadAppointments, syncLocal]),
  );

  const refreshAll = useCallback(() => {
    void load('refresh');
    void loadAppointments();
  }, [load, loadAppointments]);

  // Merge reminders + live appointments for the active tab. Appointment-linked
  // reminders are hidden here because the live appointment row represents them,
  // avoiding a duplicate entry for the same meeting.
  const listData = useMemo<ListItem[]>(() => {
    const now = Date.now();
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const endOfTodayMs = endOfToday.getTime();

    const reminderItems: ListItem[] = items
      .filter((r) => r.linkType !== 'APPOINTMENT')
      .map((r) => ({
        kind: 'reminder',
        key: r.id,
        sortAt: Date.parse(r.dueAt),
        reminder: r,
      }));

    const apptItems: ListItem[] = appointments
      .filter((a) => {
        const start = a.startTime ? Date.parse(a.startTime) : NaN;
        if (Number.isNaN(start)) return false;
        if (range === 'past') return start < now;
        if (range === 'today') return start >= now && start <= endOfTodayMs;
        return start >= now; // upcoming
      })
      .map((a) => ({
        kind: 'appointment',
        key: `appt-${a.id}`,
        sortAt: Date.parse(a.startTime as string),
        appt: a,
      }));

    const merged = [...reminderItems, ...apptItems];
    merged.sort((x, y) =>
      range === 'past' ? y.sortAt - x.sortAt : x.sortAt - y.sortAt,
    );
    return merged;
  }, [items, appointments, range]);

  function onCreated(r: Reminder) {
    setItems((prev) =>
      [r, ...prev].sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
    );
    void scheduleReminderNotification(r);
  }

  // Edit reschedules the local notification against the reminder's new
  // time/offset (scheduleReminderNotification cancels the old one first).
  function onUpdated(r: Reminder) {
    setItems((prev) =>
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
      setItems((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
      void scheduleReminderNotification(updated);
      show('Snoozed.', 'success');
    } catch (err) {
      show(
        err instanceof Error ? err.message : 'Could not snooze.',
        'error',
      );
    }
  }

  async function dismiss(r: Reminder) {
    try {
      await remindersApi.dismissReminder(r.id);
      setItems((prev) => prev.filter((x) => x.id !== r.id));
      void cancelReminderNotification(r.id);
      show('Marked done.', 'success');
    } catch (err) {
      show(
        err instanceof Error ? err.message : 'Could not dismiss.',
        'error',
      );
    }
  }

  async function remove(r: Reminder) {
    try {
      await remindersApi.deleteReminder(r.id);
      setItems((prev) => prev.filter((x) => x.id !== r.id));
      void cancelReminderNotification(r.id);
      show('Deleted.', 'success');
    } catch (err) {
      show(
        err instanceof Error ? err.message : 'Could not delete.',
        'error',
      );
    }
  }

  // Open a custom bottom-sheet menu. We can't use Alert.alert here because
  // Android only renders up to 3 buttons, which would hide Delete.
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

  return (
    <ScreenShell edges={['bottom']}>
      <PageHeader title="Reminders" showBack />

      <View style={styles.tabs}>
        {RANGES.map((r) => (
          <Pressable
            key={r.key}
            style={[styles.tab, range === r.key && styles.tabActive]}
            onPress={() => setRange(r.key)}
          >
            <Text
              style={[styles.tabText, range === r.key && styles.tabTextActive]}
            >
              {r.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {Platform.OS === 'web' ? (
        <View style={styles.webBanner}>
          <MaterialIcons name="info-outline" size={16} color="#1F49E0" />
          <Text style={styles.webBannerText}>
            Push notifications are mobile-only. Reminders you create here will
            save but only fire on the iOS / Android app.
          </Text>
        </View>
      ) : pushDenied ? (
        <View style={styles.deniedBanner}>
          <MaterialIcons name="notifications-off" size={16} color="#B91C1C" />
          <Text style={styles.deniedBannerText}>
            Reminders will not notify until you re-enable notifications in
            Settings.
          </Text>
          <Pressable onPress={() => void Linking.openSettings()}>
            <Text style={styles.deniedBannerCta}>Open Settings</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color="#1F49E0" />
        </View>
      ) : listData.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>
            No reminders {range === 'past' ? 'in history' : 'yet'}
          </Text>
          <Text style={styles.emptyBody}>
            {isGhl
              ? 'Tap + to set one. Your GoHighLevel appointments show up here automatically.'
              : 'Tap + to set one.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) =>
            item.kind === 'reminder' ? (
              <ReminderRow
                reminder={item.reminder}
                focused={focus === item.reminder.id}
                onPress={() => openMenu(item.reminder)}
                onMore={() => openMenu(item.reminder)}
              />
            ) : (
              <AppointmentRow appt={item.appt} />
            )
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refreshAll} />
          }
        />
      )}

      <Pressable
        style={styles.fab}
        onPress={openCreate}
        accessibilityLabel="Create reminder"
        accessibilityRole="button"
      >
        <MaterialIcons name="add" size={28} color="white" />
      </Pressable>

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
        onRequestClose={() => setMenuReminder(null)}
      >
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setMenuReminder(null)}
        >
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
                }}
              >
                <MaterialIcons
                  name={action.icon}
                  size={20}
                  color={action.destructive ? '#B91C1C' : '#5B6B82'}
                />
                <Text
                  style={[
                    styles.menuItemText,
                    action.destructive && styles.menuItemTextDanger,
                  ]}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
            <Pressable
              style={[styles.menuItem, styles.menuCancel]}
              onPress={() => setMenuReminder(null)}
            >
              <Text style={styles.menuCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenShell>
  );
}

// Read-only row for a GoHighLevel appointment surfaced in the reminders list.
function AppointmentRow({ appt }: { appt: GhlAppointmentSummary }) {
  const time = formatApptTime(appt.startTime);
  return (
    <View style={styles.apptRow}>
      <View style={styles.apptIcon}>
        <MaterialIcons name="event" size={18} color="#1F49E0" />
      </View>
      <View style={styles.apptCopy}>
        <Text style={styles.apptTitle} numberOfLines={1}>
          {appt.title || 'Appointment'}
        </Text>
        <View style={styles.apptMetaRow}>
          {time ? <Text style={styles.apptTime}>{time}</Text> : null}
          <View style={styles.apptChip}>
            <Text style={styles.apptChipText}>GoHighLevel</Text>
          </View>
          {appt.status ? (
            <Text style={styles.apptStatus}>{appt.status}</Text>
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
  if (!value) return null;
  return (
    <View style={styles.apptDetailRow}>
      <MaterialIcons name={icon} size={13} color="#5B6B82" />
      <Text style={styles.apptDetailText} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

// Show the appointment's start time exactly as GoHighLevel reports it — no
// timezone conversion and no start–end range. The CRM sends a wall-clock ISO
// (e.g. "2026-07-12T02:00:00+03:00"); we read the digits directly rather than
// letting `new Date` shift them into the device timezone.
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
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'white',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5EAF5',
  },
  tabActive: { backgroundColor: '#1F49E0', borderColor: '#1F49E0' },
  tabText: { fontSize: 14, color: '#5B6B82', fontWeight: '500' },
  tabTextActive: { color: 'white' },
  webBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    backgroundColor: '#EEF3FF',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  webBannerText: { flex: 1, fontSize: 12, color: '#0F172A', lineHeight: 16 },
  deniedBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deniedBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#7F1D1D',
    lineHeight: 16,
  },
  deniedBannerCta: { fontSize: 12, color: '#B91C1C', fontWeight: '600' },
  apptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5EAF5',
    backgroundColor: 'white',
  },
  apptIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EEF3FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  apptCopy: { flex: 1, gap: 4 },
  apptTitle: { fontSize: 16, fontWeight: '600', color: '#0F172A' },
  apptMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  apptTime: { fontSize: 13, color: '#1F49E0', fontWeight: '500' },
  apptChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#EEF3FF',
    borderRadius: 999,
  },
  apptChipText: { fontSize: 11, color: '#1F49E0', fontWeight: '600' },
  apptStatus: { fontSize: 12, color: '#5B6B82', textTransform: 'capitalize' },
  apptDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  apptDetailText: { fontSize: 12, color: '#5B6B82', flex: 1 },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 28,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5EAF5',
    marginBottom: 12,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  menuItemText: { fontSize: 16, color: '#0F172A', fontWeight: '500' },
  menuItemTextDanger: { color: '#B91C1C' },
  menuCancel: {
    justifyContent: 'center',
    marginTop: 6,
    backgroundColor: '#F1F5F9',
  },
  menuCancelText: { fontSize: 16, color: '#0F172A', fontWeight: '600' },
  loadingState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  emptyBody: { fontSize: 14, color: '#5B6B82', textAlign: 'center' },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1F49E0',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
});
