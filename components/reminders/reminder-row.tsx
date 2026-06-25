import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Reminder } from '@/lib/api/types';

type Props = {
  reminder: Reminder;
  // Highlighted state used when the user opens the screen via a push tap
  // (the `focus` route param matches this row's id).
  focused?: boolean;
  onPress(): void;
  onMore(): void;
};

export function ReminderRow({ reminder, focused, onPress, onMore }: Props) {
  const due = useMemo(() => new Date(reminder.dueAt), [reminder.dueAt]);
  const { relative, absolute } = useMemo(() => formatDueTime(due), [due]);
  const isOverdue =
    reminder.status === 'SCHEDULED' && due.getTime() < Date.now();

  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, focused && styles.rowFocused]}
      accessibilityRole="button"
      accessibilityLabel={`Reminder: ${reminder.title}, ${relative}`}
    >
      <View style={styles.left}>
        <Text style={styles.title} numberOfLines={1}>
          {reminder.title}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.due, isOverdue && styles.dueOverdue]}>
            {relative}
          </Text>
          <Text style={styles.dueAbsolute}>{absolute}</Text>
          {reminder.linkLabel ? (
            <View style={styles.linkChip}>
              <MaterialIcons name="link" size={12} color="#1F49E0" />
              <Text style={styles.linkChipText} numberOfLines={1}>
                {reminder.linkLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <Pressable
        hitSlop={12}
        onPress={onMore}
        style={styles.moreButton}
        accessibilityRole="button"
        accessibilityLabel="More actions"
      >
        <MaterialIcons name="more-vert" size={22} color="#5B6B82" />
      </Pressable>
    </Pressable>
  );
}

function formatDueTime(due: Date): { relative: string; absolute: string } {
  const diffMs = due.getTime() - Date.now();
  const absMin = Math.round(Math.abs(diffMs) / 60_000);
  const past = diffMs < 0;

  let relative: string;
  if (absMin < 1) {
    relative = past ? 'just now' : 'in a moment';
  } else if (absMin < 60) {
    relative = past ? `${absMin}m ago` : `in ${absMin}m`;
  } else if (absMin < 24 * 60) {
    const hours = Math.round(absMin / 60);
    relative = past ? `${hours}h ago` : `in ${hours}h`;
  } else {
    const days = Math.round(absMin / (60 * 24));
    relative = past ? `${days}d ago` : `in ${days}d`;
  }

  const absolute = due.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return { relative, absolute };
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5EAF5',
    backgroundColor: 'white',
  },
  rowFocused: { backgroundColor: '#EEF3FF' },
  left: { flex: 1, paddingRight: 12 },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  due: { fontSize: 13, color: '#1F49E0', fontWeight: '500' },
  dueOverdue: { color: '#B91C1C' },
  dueAbsolute: { fontSize: 12, color: '#5B6B82' },
  linkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#EEF3FF',
    borderRadius: 999,
  },
  linkChipText: { fontSize: 12, color: '#1F49E0', maxWidth: 120 },
  moreButton: { padding: 4 },
});
