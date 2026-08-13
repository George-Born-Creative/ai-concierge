import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PageHeader } from '@/components/page-header';
import { ScreenShell } from '@/components/screen';
import {
  UiControlHeights,
  UiRadii,
  UiSpacing,
  UiTypography,
} from '@/constants/theme';
import { useAppTheme } from '@/lib/theme/theme-provider';
import { getMe } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { openaiApi } from '@/lib/api';
import { refreshUser } from '@/lib/session';
import { useToast } from '@/lib/toast';

type Mode = 'enter' | 'saved';

export function OpenAIApiKeyScreen() {
  const { colors, resolvedTheme } = useAppTheme();
  const router = useRouter();
  const { show } = useToast();
  const { provider, from, replace } = useLocalSearchParams<{
    provider?: string;
    from?: string;
    replace?: string;
  }>();
  const isProfileRotate = from === 'profile';
  const [apiKey, setApiKey] = useState('');
  const [savedLast4, setSavedLast4] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('enter');
  const [submitting, setSubmitting] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const maskedKey = useMemo(() => (savedLast4 ? `sk-•••• •••• ${savedLast4}` : ''), [savedLast4]);

  // On first paint, check if the user already has a key on file. If so, jump
  // straight to the masked "saved" state so they don't have to re-paste.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await openaiApi.getStatus();
        if (cancelled) return;
        if (status.exists && status.last4) {
          setSavedLast4(status.last4);
          if (!isProfileRotate && replace !== '1') {
            setMode('saved');
          }
        }
      } catch {
        // Non-fatal: keep the enter form visible so the user can paste a key.
      } finally {
        if (!cancelled) {
          setLoadingStatus(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isProfileRotate, replace]);

  async function saveKey() {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      show('Enter your OpenAI API key to continue.', 'error');
      return;
    }
    if (trimmed.length < 20) {
      show('That key looks too short. Paste the full key (sk-...).', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const save = isProfileRotate || savedLast4 ? openaiApi.rotateKey : openaiApi.saveKey;
      const status = await save({ key: trimmed });
      setSavedLast4(status.last4);
      setApiKey('');
      show(
        isProfileRotate ? 'OpenAI key updated.' : 'OpenAI key saved securely.',
        'success'
      );
      if (status.quotaWarning) {
        show(
          'This OpenAI account has no usage quota. Voice will not work until you add billing at platform.openai.com (Settings → Billing).',
          'error'
        );
      }

      // Refresh cached user so /(tabs) doesn't bounce back here on cold start.
      try {
        const me = await getMe();
        await refreshUser(me);
      } catch {
        // Non-fatal.
      }

      if (isProfileRotate) {
        router.back();
        return;
      }

      setMode('saved');
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message || 'Could not save the key. Please try again.'
          : err instanceof Error
            ? err.message
            : 'Could not save the key. Please try again.';
      show(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function startReplace() {
    setMode('enter');
    setApiKey('');
  }

  function goBack() {
    if (isProfileRotate) {
      router.back();
      return;
    }
    router.replace('/connect');
  }

  function finish() {
    router.replace('/(tabs)');
  }

  const title = isProfileRotate ? 'Rotate OpenAI key' : 'Your OpenAI API key';
  const subtitle = isProfileRotate
    ? 'Paste a new key to replace the one used for voice transcription.'
    : provider
      ? 'Your CRM is connected. Add your OpenAI key to power voice commands.'
      : 'Add your OpenAI key to power voice commands.';

  return (
    <ScreenShell>
      <PageHeader title={title} showBack onBack={goBack} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={false}
          overScrollMode="never">
          <View style={styles.headerIcon}>
            <MaterialIcons name="key" size={28} color={colors.primary} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <Text style={styles.helperText}>
            Stored encrypted on our server. We never show your full key again after you save it.
          </Text>

          {loadingStatus ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Checking saved key…</Text>
            </View>
          ) : mode === 'saved' && savedLast4 && !isProfileRotate ? (
            <View style={styles.formCard}>
              <Text style={styles.fieldLabel}>Saved key</Text>
              <View style={styles.maskedKey}>
                <MaterialIcons name="lock" size={20} color={colors.success} />
                <Text style={styles.maskedKeyText}>{maskedKey}</Text>
              </View>
              <Text style={styles.maskedHint}>You can replace this key at any time.</Text>

              <Pressable style={styles.secondaryButton} onPress={startReplace}>
                <MaterialIcons name="refresh" size={20} color={colors.primary} />
                <Text style={styles.secondaryButtonText}>Replace key</Text>
              </Pressable>

              <Pressable style={styles.primaryButton} onPress={finish}>
                <Text style={styles.primaryButtonText}>Continue to the app</Text>
                <MaterialIcons name="arrow-forward" size={22} color={colors.onPrimary} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.formCard}>
              {savedLast4 ? (
                <View style={styles.currentKeyRow}>
                  <MaterialIcons name="lock" size={18} color={colors.success} />
                  <Text style={styles.currentKeyText}>Current key ends in {savedLast4}</Text>
                </View>
              ) : null}
              <Text style={styles.fieldLabel}>
                {isProfileRotate || savedLast4 ? 'New OpenAI API key' : 'OpenAI API Key'}
              </Text>
              <View style={styles.inputShell}>
                <MaterialIcons name="vpn-key" size={21} color={colors.icon} />
                <TextInput
                  value={apiKey}
                  onChangeText={setApiKey}
                  placeholder="sk-..."
                  placeholderTextColor={colors.placeholder}
                  keyboardAppearance={resolvedTheme}
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={saveKey}
                />
              </View>

              <Pressable
                style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
                onPress={saveKey}
                disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>
                      {isProfileRotate || savedLast4 ? 'Update key' : 'Save key securely'}
                    </Text>
                    <MaterialIcons name="check" size={22} color={colors.onPrimary} />
                  </>
                )}
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    maxWidth: 640,
    paddingBottom: 64,
    paddingHorizontal: UiSpacing.lg,
    paddingTop: UiSpacing.xl,
    width: '100%',
  },
  headerIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: UiRadii.icon,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  title: {
    color: '#202124',
    fontSize: UiTypography.display.fontSize,
    fontWeight: '600',
    letterSpacing: -0.7,
    lineHeight: UiTypography.display.lineHeight,
    marginTop: UiSpacing.lg,
  },
  subtitle: {
    color: '#5F6368',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    marginTop: UiSpacing.sm,
  },
  helperText: {
    color: '#80868B',
    fontSize: UiTypography.label.fontSize,
    lineHeight: 18,
    marginTop: UiSpacing.xs,
  },
  loadingCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    gap: UiSpacing.sm,
    marginTop: UiSpacing.xl,
    padding: UiSpacing.xl,
  },
  loadingText: {
    color: '#5F6368',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  currentKeyRow: {
    alignItems: 'center',
    backgroundColor: '#F1F8F4',
    borderColor: '#CDE6D5',
    borderRadius: UiRadii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    marginBottom: UiSpacing.md,
    paddingHorizontal: UiSpacing.md,
    paddingVertical: UiSpacing.sm,
  },
  currentKeyText: {
    color: '#1A5C33',
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    marginTop: UiSpacing.xl,
    padding: UiSpacing.lg,
  },
  fieldLabel: {
    color: '#202124',
    fontSize: UiTypography.cardHeading.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.cardHeading.lineHeight,
    marginBottom: UiSpacing.sm,
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: '#F8FAFF',
    borderColor: '#E4EBF7',
    borderRadius: UiRadii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    minHeight: UiControlHeights.input,
    paddingHorizontal: UiSpacing.md,
  },
  input: {
    color: '#202124',
    flex: 1,
    fontSize: UiTypography.input.fontSize,
    lineHeight: UiTypography.input.lineHeight,
  },
  maskedKey: {
    alignItems: 'center',
    backgroundColor: '#F1F8F4',
    borderColor: '#CDE6D5',
    borderRadius: UiRadii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    minHeight: UiControlHeights.input,
    paddingHorizontal: UiSpacing.md,
  },
  maskedKeyText: {
    color: '#1A5C33',
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '600',
    letterSpacing: 1,
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  maskedHint: {
    color: '#5F6368',
    fontSize: UiTypography.label.fontSize,
    lineHeight: 18,
    marginTop: UiSpacing.sm,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: UiRadii.control,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    justifyContent: 'center',
    marginTop: UiSpacing.md,
    minHeight: UiControlHeights.button,
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: UiTypography.button.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.button.lineHeight,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#1A73E8',
    borderRadius: UiRadii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    justifyContent: 'center',
    marginTop: UiSpacing.md,
    minHeight: UiControlHeights.button,
  },
  secondaryButtonText: {
    color: '#1A73E8',
    fontSize: UiTypography.button.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.button.lineHeight,
  },
});
