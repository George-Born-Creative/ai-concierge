import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { remindersApi } from '@/lib/api';
import type { Reminder } from '@/lib/api/types';
import { useAppTheme } from '@/lib/theme/theme-provider';
import { useToast } from '@/lib/toast';

type Props = {
  visible: boolean;
  onClose(): void;
  onCreated(reminder: Reminder): void;
  // When provided, the modal edits this reminder instead of creating a new one.
  reminder?: Reminder | null;
  onUpdated?(reminder: Reminder): void;
};

// Lead-time presets the user can pick before the event fires the notification.
const OFFSET_OPTIONS: { label: string; value: number }[] = [
  { label: 'At time', value: 0 },
  { label: '5 min', value: 5 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
];

const DEFAULT_OFFSET = 15;

// Mirrors the backend: fire `offset` minutes before the event, unless that's
// already past (created inside the lead window), in which case fire at the event.
function computeNotifyAt(dueAt: Date, offsetMinutes: number): Date {
  const candidate = new Date(dueAt.getTime() - offsetMinutes * 60_000);
  return candidate.getTime() <= Date.now() ? dueAt : candidate;
}

export function CreateReminderModal({
  visible,
  onClose,
  onCreated,
  reminder,
  onUpdated,
}: Props) {
  const { show } = useToast();
  const { colors, resolvedTheme } = useAppTheme();
  const isEdit = !!reminder;

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueAt, setDueAt] = useState<Date>(
    () => new Date(Date.now() + 60 * 60 * 1000),
  );
  const [offset, setOffset] = useState<number>(DEFAULT_OFFSET);
  const [submitting, setSubmitting] = useState(false);

  // Android shows the picker imperatively; iOS uses an inline spinner.
  const [androidPicker, setAndroidPicker] = useState<'date' | 'time' | null>(
    null,
  );

  // Prime the form whenever the modal opens (fresh "now + 1h" for create, or
  // the reminder's values for edit).
  useEffect(() => {
    if (!visible) return;
    if (reminder) {
      setTitle(reminder.title);
      setNotes(reminder.notes ?? '');
      setDueAt(new Date(reminder.dueAt));
      setOffset(reminder.remindOffsetMinutes ?? DEFAULT_OFFSET);
    } else {
      setTitle('');
      setNotes('');
      setDueAt(new Date(Date.now() + 60 * 60 * 1000));
      setOffset(DEFAULT_OFFSET);
    }
    setSubmitting(false);
    setAndroidPicker(null);
  }, [visible, reminder]);

  function close() {
    setAndroidPicker(null);
    onClose();
  }

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      show('Title is required.', 'error');
      return;
    }
    if (dueAt.getTime() < Date.now() + 30_000) {
      show('Pick a future date and time — past times are not allowed.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit && reminder) {
        const updated = await remindersApi.updateReminder(reminder.id, {
          title: trimmed,
          notes: notes.trim() || undefined,
          dueAt: dueAt.toISOString(),
          remindOffsetMinutes: offset,
        });
        onUpdated?.(updated);
        show('Reminder updated.', 'success');
      } else {
        const created = await remindersApi.createReminder({
          title: trimmed,
          notes: notes.trim() || undefined,
          dueAt: dueAt.toISOString(),
          remindOffsetMinutes: offset,
          source: 'text',
        });
        onCreated(created);
        show('Reminder created.', 'success');
      }
      close();
    } catch (err) {
      show(
        err instanceof Error
          ? err.message
          : `Could not ${isEdit ? 'update' : 'create'} reminder.`,
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  }

  function onChangeNative(event: DateTimePickerEvent, picked?: Date) {
    if (Platform.OS === 'android') setAndroidPicker(null);
    if (event.type === 'dismissed' || !picked) return;
    setDueAt(picked);
  }

  const notifyAt = computeNotifyAt(dueAt, offset);
  const notifyLabel = notifyAt.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.heading}>
              {isEdit ? 'Edit reminder' : 'New reminder'}
            </Text>

            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Call Sarah about renewal"
              placeholderTextColor={colors.placeholder}
              keyboardAppearance={resolvedTheme}
              value={title}
              onChangeText={setTitle}
              autoFocus={!isEdit}
            />

            <Text style={styles.label}>Notes (optional)</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Any extra context for the notification body"
              placeholderTextColor={colors.placeholder}
              keyboardAppearance={resolvedTheme}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
            />

            <Text style={styles.label}>Event time</Text>
            {Platform.OS === 'ios' ? (
              <DateTimePicker
                value={dueAt}
                mode="datetime"
                display="spinner"
                minimumDate={new Date(Date.now() + 30_000)}
                themeVariant={resolvedTheme}
                accentColor={colors.primary}
                onChange={onChangeNative}
              />
            ) : Platform.OS === 'android' ? (
              <View style={styles.androidPickerRow}>
                <Pressable
                  style={styles.androidPickerBtn}
                  onPress={() => setAndroidPicker('date')}
                >
                  <Text style={styles.androidPickerBtnText}>
                    {dueAt.toLocaleDateString()}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.androidPickerBtn}
                  onPress={() => setAndroidPicker('time')}
                >
                  <Text style={styles.androidPickerBtnText}>
                    {dueAt.toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                </Pressable>
                {androidPicker ? (
                  <DateTimePicker
                    value={dueAt}
                    mode={androidPicker}
                    minimumDate={
                      androidPicker === 'date' ? new Date() : undefined
                    }
                    onChange={onChangeNative}
                  />
                ) : null}
              </View>
            ) : (
              <TextInput
                style={styles.input}
                value={dueAt.toISOString().slice(0, 16)}
                onChangeText={(t) => {
                  const parsed = new Date(t);
                  if (!Number.isNaN(parsed.getTime())) setDueAt(parsed);
                }}
                placeholder="YYYY-MM-DDTHH:MM"
                placeholderTextColor={colors.placeholder}
                keyboardAppearance={resolvedTheme}
              />
            )}

            <Text style={styles.label}>Remind me</Text>
            <View style={styles.offsetRow}>
              {OFFSET_OPTIONS.map((opt) => {
                const active = opt.value === offset;
                return (
                  <Pressable
                    key={opt.value}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setOffset(opt.value)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        active && styles.chipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.notifyHint}>
              {offset === 0
                ? `You'll be notified at the event · ${notifyLabel}`
                : `First alert ${notifyLabel}, then again closer in — and at the event time.`}
            </Text>

            <View style={styles.actions}>
              <Pressable
                style={[styles.btn, styles.btnGhost]}
                onPress={close}
                disabled={submitting}
              >
                <Text style={styles.btnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.btn,
                  styles.btnPrimary,
                  submitting && styles.btnDisabled,
                ]}
                onPress={submit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={styles.btnPrimaryText}>
                    {isEdit ? 'Save' : 'Create'}
                  </Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5EAF5',
    marginBottom: 16,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 16,
  },
  label: { fontSize: 13, color: '#5B6B82', marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#E5EAF5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0F172A',
    backgroundColor: '#F8FAFF',
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  androidPickerRow: { flexDirection: 'row', gap: 12 },
  androidPickerBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E5EAF5',
    borderRadius: 12,
    backgroundColor: '#F8FAFF',
    alignItems: 'center',
  },
  androidPickerBtnText: { fontSize: 16, color: '#0F172A', fontWeight: '500' },
  offsetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5EAF5',
    backgroundColor: '#F8FAFF',
  },
  chipActive: { backgroundColor: '#1F49E0', borderColor: '#1F49E0' },
  chipText: { fontSize: 14, color: '#5B6B82', fontWeight: '500' },
  chipTextActive: { color: 'white' },
  notifyHint: { fontSize: 12, color: '#64748B', marginTop: 10 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnGhost: { backgroundColor: '#F1F5F9' },
  btnGhostText: { color: '#0F172A', fontWeight: '600' },
  btnPrimary: { backgroundColor: '#1F49E0' },
  btnPrimaryText: { color: 'white', fontWeight: '600' },
  btnDisabled: { opacity: 0.6 },
});
