import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { requestPasswordReset } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import {
  OTP_RESEND_COOLDOWN_SECONDS,
  startOtpCooldown,
} from '@/lib/auth/otp-cooldown';
import { getOtpErrorMessage } from '@/lib/auth/otp-error';
import { useToast } from '@/lib/toast';

// Loose client-side check only — the backend is the source of truth.
const EMAIL_RE = /.+@.+\..+/;

export function ForgotPasswordScreen() {
  const { colors, resolvedTheme } = useAppTheme();
  const router = useRouter();
  const { show } = useToast();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      show('Enter a valid email address.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const result = await requestPasswordReset({ email: trimmed });
      await startOtpCooldown(
        'password-reset',
        trimmed,
        result.retryAfterSeconds ?? OTP_RESEND_COOLDOWN_SECONDS,
      );
      show('We sent a reset code to your email.', 'success');
      router.push(
        `/reset-password?email=${encodeURIComponent(trimmed)}` as Href,
      );
    } catch (err) {
      // No account for this email — the user needs to sign up first, so surface
      // the message and route them to the sign-up screen.
      if (err instanceof ApiError && err.status === 404) {
        show('No account found with this email. Please sign up first.', 'error');
        router.replace('/signup');
        return;
      }
      show(getOtpErrorMessage(err, 'Could not start the reset.'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenShell>
      <PageHeader showBack onBack={() => router.replace('/signin')} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <View style={styles.content}>
          <Text style={styles.title}>Forgot password?</Text>
          <Text style={styles.subtitle}>
            Enter the email for your account and we&apos;ll send you a 6-digit
            code to reset your password.
          </Text>

          <View style={styles.inputShell}>
            <MaterialIcons name="alternate-email" size={21} color={colors.icon} />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email address"
              placeholderTextColor={colors.placeholder}
              keyboardAppearance={resolvedTheme}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="done"
              autoFocus
              onSubmitEditing={submit}
            />
          </View>

          <Pressable
            style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
            onPress={submit}
            disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>Send reset code</Text>
                <MaterialIcons name="arrow-forward" size={21} color={colors.onPrimary} />
              </>
            )}
          </Pressable>

          <Pressable
            style={styles.switchButton}
            onPress={() => router.replace('/signin')}>
            <Text style={styles.switchText}>Back to sign in</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    alignSelf: 'center',
    flex: 1,
    justifyContent: 'center',
    maxWidth: 480,
    paddingHorizontal: UiSpacing.xxl,
    width: '100%',
  },
  title: {
    color: '#202124',
    fontSize: UiTypography.pageTitle.fontSize,
    fontWeight: '600',
    letterSpacing: -0.5,
    lineHeight: UiTypography.pageTitle.lineHeight,
    textAlign: 'center',
  },
  subtitle: {
    color: '#5F6368',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    marginTop: UiSpacing.sm,
    maxWidth: 360,
    textAlign: 'center',
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: '#F8FAFF',
    borderColor: '#E4EBF7',
    borderRadius: UiRadii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    marginTop: UiSpacing.xxl,
    minHeight: UiControlHeights.input,
    paddingHorizontal: UiSpacing.md,
    width: '100%',
  },
  input: {
    color: '#202124',
    flex: 1,
    fontSize: UiTypography.input.fontSize,
    lineHeight: UiTypography.input.lineHeight,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: UiRadii.control,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    justifyContent: 'center',
    marginTop: UiSpacing.lg,
    minHeight: UiControlHeights.button,
    width: '100%',
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
  switchButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: UiSpacing.md,
    minHeight: UiControlHeights.button,
  },
  switchText: {
    color: '#5F6368',
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '500',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
});
