import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PageHeader } from '@/components/page-header';
import { CreateReminderModal } from '@/components/reminders/create-reminder-modal';
import { ReminderRow } from '@/components/reminders/reminder-row';
import { remindersApi } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import type {
  Reminder,
  ReminderListRange,
  SnoozePreset,
} from '@/lib/api/types';
import { usePushState } from '@/lib/push/state';
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

export function RemindersScreenContent() {
  const { show } = useToast();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const pushState = usePushState();

  const [range, setRange] = useState<ReminderListRange>('upcoming');
  const [items, setItems] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

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

  useFocusEffect(
    useCallback(() => {
      void load('initial');
    }, [load]),
  );

  function onCreated(r: Reminder) {
    setItems((prev) =>
      [r, ...prev].sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
    );
  }

  async function snooze(r: Reminder, preset: SnoozePreset) {
    try {
      const updated = await remindersApi.snoozeReminder(r.id, { preset });
      setItems((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
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
      show('Deleted.', 'success');
    } catch (err) {
      show(
        err instanceof Error ? err.message : 'Could not delete.',
        'error',
      );
    }
  }

  function openMenu(r: Reminder) {
    const options: {
      label: string;
      onPress: () => void;
      destructive?: boolean;
    }[] = [
      ...SNOOZE_OPTIONS.map((s) => ({
        label: s.label,
        onPress: () => void snooze(r, s.preset),
      })),
      { label: 'Mark done', onPress: () => void dismiss(r) },
      {
        label: 'Delete',
        onPress: () => void remove(r),
        destructive: true,
      },
    ];

    Alert.alert(r.title, undefined, [
      ...options.map((opt) => ({
        text: opt.label,
        style: opt.destructive
          ? ('destructive' as const)
          : ('default' as const),
        onPress: opt.onPress,
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  const pushDenied = pushState.status === 'denied';

  return (
    <SafeAreaView style={styles.container}>
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
      ) : items.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>
            No reminders {range === 'past' ? 'in history' : 'yet'}
          </Text>
          <Text style={styles.emptyBody}>
            Tap + to set one. Voice creation is coming in the next release.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <ReminderRow
              reminder={item}
              focused={focus === item.id}
              onPress={() => openMenu(item)}
              onMore={() => openMenu(item)}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load('refresh')}
            />
          }
        />
      )}

      <Pressable
        style={styles.fab}
        onPress={() => setModalVisible(true)}
        accessibilityLabel="Create reminder"
        accessibilityRole="button"
      >
        <MaterialIcons name="add" size={28} color="white" />
      </Pressable>

      <CreateReminderModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onCreated={onCreated}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFF' },
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
