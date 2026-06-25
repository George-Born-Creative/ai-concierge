import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { remindersApi } from '@/lib/api';
import type { Reminder } from '@/lib/api/types';
import { useToast } from '@/lib/toast';

type Props = {
  visible: boolean;
  onClose(): void;
  onCreated(reminder: Reminder): void;
};

export function CreateReminderModal({ visible, onClose, onCreated }: Props) {
  const { show } = useToast();
  // Recompute the default due time each time the modal becomes visible so
  // a re-open after dismiss starts from "now + 1 hour" again.
  const defaultDue = useMemo(
    () => new Date(Date.now() + 60 * 60 * 1000),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible],
  );

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueAt, setDueAt] = useState<Date>(defaultDue);
  const [submitting, setSubmitting] = useState(false);

  // Android shows the picker imperatively; iOS uses an inline spinner.
  const [androidPicker, setAndroidPicker] = useState<'date' | 'time' | null>(
    null,
  );

  function reset() {
    setTitle('');
    setNotes('');
    setDueAt(defaultDue);
    setSubmitting(false);
    setAndroidPicker(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      show('Title is required.', 'error');
      return;
    }
    if (dueAt.getTime() < Date.now() + 30_000) {
      show('Pick a time at least 30 seconds in the future.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const created = await remindersApi.createReminder({
        title: trimmed,
        notes: notes.trim() || undefined,
        dueAt: dueAt.toISOString(),
        source: 'text',
      });
      onCreated(created);
      show('Reminder created.', 'success');
      close();
    } catch (err) {
      show(
        err instanceof Error ? err.message : 'Could not create reminder.',
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
          <Text style={styles.heading}>New reminder</Text>

          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Call Sarah about renewal"
            placeholderTextColor="#94A3B8"
            value={title}
            onChangeText={setTitle}
            autoFocus
          />

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Any extra context for the notification body"
            placeholderTextColor="#94A3B8"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />

          <Text style={styles.label}>Due at</Text>
          {Platform.OS === 'ios' ? (
            <DateTimePicker
              value={dueAt}
              mode="datetime"
              display="spinner"
              minimumDate={new Date(Date.now() + 30_000)}
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
              placeholderTextColor="#94A3B8"
            />
          )}

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
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.btnPrimaryText}>Create</Text>
              )}
            </Pressable>
          </View>
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
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnGhost: { backgroundColor: '#F1F5F9' },
  btnGhostText: { color: '#0F172A', fontWeight: '600' },
  btnPrimary: { backgroundColor: '#1F49E0' },
  btnPrimaryText: { color: 'white', fontWeight: '600' },
  btnDisabled: { opacity: 0.6 },
});
