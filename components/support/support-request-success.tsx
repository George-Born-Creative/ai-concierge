import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  UiControlHeights,
  UiRadii,
  UiSpacing,
  UiTypography,
} from '@/constants/theme';
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
  wrap: { alignItems: 'center', gap: UiSpacing.sm, paddingHorizontal: UiSpacing.xl, paddingTop: UiSpacing.xxxl },
  successIcon: { alignItems: 'center', borderRadius: UiRadii.card, height: 56, justifyContent: 'center', width: 56 },
  title: { fontSize: UiTypography.sectionHeading.fontSize, fontWeight: '700', letterSpacing: -0.3, lineHeight: UiTypography.sectionHeading.lineHeight, marginTop: UiSpacing.sm, textAlign: 'center' },
  body: { fontSize: UiTypography.bodySmall.fontSize, lineHeight: UiTypography.bodySmall.lineHeight, maxWidth: 440, textAlign: 'center' },
  referenceCard: { alignItems: 'center', borderRadius: UiRadii.card, borderWidth: 1, gap: UiSpacing.sm, marginTop: UiSpacing.md, maxWidth: 440, padding: UiSpacing.lg, width: '100%' },
  referenceLabel: { fontSize: UiTypography.caption.fontSize, fontWeight: '800', letterSpacing: 1, lineHeight: UiTypography.caption.lineHeight },
  reference: { fontSize: UiTypography.sectionHeading.fontSize, fontWeight: '700', letterSpacing: 0.6, lineHeight: UiTypography.sectionHeading.lineHeight, textAlign: 'center' },
  copyButton: { alignItems: 'center', borderRadius: UiRadii.control, borderWidth: 1, flexDirection: 'row', gap: UiSpacing.xs, justifyContent: 'center', minHeight: UiControlHeights.button, paddingHorizontal: UiSpacing.md },
  copyText: { fontSize: UiTypography.button.fontSize, fontWeight: '700', lineHeight: UiTypography.button.lineHeight },
  delivery: { fontSize: UiTypography.label.fontSize, lineHeight: UiTypography.label.lineHeight, maxWidth: 430, textAlign: 'center' },
  doneButton: { alignItems: 'center', borderRadius: UiRadii.control, justifyContent: 'center', marginTop: UiSpacing.md, maxWidth: 440, minHeight: UiControlHeights.button, width: '100%' },
  doneText: { fontSize: UiTypography.button.fontSize, fontWeight: '700', lineHeight: UiTypography.button.lineHeight },
});
