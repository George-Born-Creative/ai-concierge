import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CreateSupportRequestResponse } from '@/lib/api/types';
import { useAppTheme } from '@/lib/theme/theme-provider';

export function SupportRequestSuccess({
  result,
  mode,
  onDone,
}: {
  result: CreateSupportRequestResponse;
  mode: 'support' | 'feedback';
  onDone: () => void;
}) {
  const { colors } = useAppTheme();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timeout);
  }, [copied]);

  async function copyReference() {
    await Clipboard.setStringAsync(result.caseReference);
    setCopied(true);
  }

  const deliveryNote = `Your request is saved to your account. Case updates will go to ${result.email}.`;

  return (
    <View style={styles.wrap}>
      <View
        accessibilityLabel="Request received"
        style={[styles.successIcon, { backgroundColor: colors.successSurface }]}>
        <MaterialIcons name="check" size={32} color={colors.success} />
      </View>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
        {mode === 'feedback' ? 'Thanks for the feedback' : 'Your request is in'}
      </Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        {mode === 'feedback'
          ? 'We read every submission, though a personal reply is not guaranteed.'
          : 'Support has the details you provided and can use this reference to find your case.'}
      </Text>

      <View
        style={[
          styles.referenceCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
        <Text style={[styles.referenceLabel, { color: colors.textMuted }]}>CASE REFERENCE</Text>
        <Text selectable style={[styles.reference, { color: colors.textPrimary }]}>{result.caseReference}</Text>
        <Pressable
          accessibilityLabel={copied ? 'Case reference copied' : 'Copy case reference'}
          accessibilityRole="button"
          onPress={() => void copyReference()}
          style={({ pressed }) => [
            styles.copyButton,
            { borderColor: colors.borderStrong },
            pressed && { backgroundColor: colors.surfacePressed },
          ]}>
          <MaterialIcons name={copied ? 'check' : 'content-copy'} size={18} color={colors.primary} />
          <Text style={[styles.copyText, { color: colors.primary }]}>{copied ? 'Copied' : 'Copy reference'}</Text>
        </Pressable>
      </View>

      <Text style={[styles.delivery, { color: colors.textSecondary }]}>{deliveryNote}</Text>

      <Pressable
        accessibilityRole="button"
        onPress={onDone}
        style={({ pressed }) => [
          styles.doneButton,
          { backgroundColor: pressed ? colors.primaryPressed : colors.primary },
        ]}>
        <Text style={[styles.doneText, { color: colors.onPrimary }]}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10, paddingHorizontal: 22, paddingTop: 48 },
  successIcon: { alignItems: 'center', borderRadius: 20, height: 72, justifyContent: 'center', width: 72 },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.4, marginTop: 8, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, maxWidth: 440, textAlign: 'center' },
  referenceCard: { alignItems: 'center', borderRadius: 16, borderWidth: 1, gap: 8, marginTop: 14, maxWidth: 440, padding: 18, width: '100%' },
  referenceLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  reference: { fontSize: 21, fontWeight: '700', letterSpacing: 0.6, textAlign: 'center' },
  copyButton: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 },
  copyText: { fontSize: 14, fontWeight: '700' },
  delivery: { fontSize: 13, lineHeight: 19, maxWidth: 430, textAlign: 'center' },
  doneButton: { alignItems: 'center', borderRadius: 13, justifyContent: 'center', marginTop: 12, maxWidth: 440, minHeight: 50, width: '100%' },
  doneText: { fontSize: 16, fontWeight: '700' },
});
