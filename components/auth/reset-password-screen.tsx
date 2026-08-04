import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { requestPasswordReset, resetPassword } from '@/lib/api/auth';
import {
  clearOtpCooldown,
  getOtpCooldownRemaining,
  OTP_RESEND_COOLDOWN_SECONDS,
  startOtpCooldown,
} from '@/lib/auth/otp-cooldown';
import { getOtpErrorMessage } from '@/lib/auth/otp-error';
import { useToast } from '@/lib/toast';

const CODE_LENGTH = 6;
const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordScreen() {
  const { colors, resolvedTheme } = useAppTheme();
  const router = useRouter();
  const { show } = useToast();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = (params.email ?? '').trim().toLowerCase();

  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [checkingContext, setCheckingContext] = useState(true);
  const [cooldown, setCooldown] = useState(0);
  const codeInputRef = useRef<TextInput>(null);
  const redirected = useRef(false);

  useEffect(() => {
    let active = true;

    async function loadResetContext() {
      if (!email) {
        redirected.current = true;
        show('Enter your email to request a password-reset code.', 'error');
        router.replace('/forgot-password');
        return;
      }

      const remaining = await getOtpCooldownRemaining(
        'password-reset',
        email,
      );
      if (!active) return;

      setCooldown(remaining);
      setCheckingContext(false);
    }

    void loadResetContext();
    return () => {
      active = false;
    };
  }, [email, router, show]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function submit() {
    if (code.length !== CODE_LENGTH) {
      show(`Enter the ${CODE_LENGTH}-digit code from your email.`, 'error');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      show(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`, 'error');
      return;
    }
    if (password !== confirm) {
      show('New password and confirmation do not match.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword({ email, code, newPassword: password });
      await clearOtpCooldown('password-reset', email);
      if (redirected.current) return;
      redirected.current = true;
      show('Password updated — sign in with your new password.', 'success');
      router.replace('/signin');
    } catch (err) {
      show(
        getOtpErrorMessage(err, 'Could not reset your password.'),
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || !email || resending || submitting) return;
    setResending(true);
    try {
      const result = await requestPasswordReset({ email });
      const nextCooldown =
        result.retryAfterSeconds ?? OTP_RESEND_COOLDOWN_SECONDS;
      await startOtpCooldown('password-reset', email, nextCooldown);
      setCode('');
      setCooldown(Math.ceil(nextCooldown));
      codeInputRef.current?.focus();
      show('A new code is on its way.', 'success');
    } catch (err) {
      show(getOtpErrorMessage(err, 'Could not resend the code.'), 'error');
    } finally {
      setResending(false);
    }
  }

  if (checkingContext) {
    return (
      <ScreenShell>
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <PageHeader showBack onBack={() => router.replace('/forgot-password')} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={false}
          overScrollMode="never">
          <Text style={styles.title}>Reset password</Text>
          <Text style={styles.subtitle}>
            We sent a {CODE_LENGTH}-digit code to{' '}
            <Text style={styles.email}>{maskEmail(email)}</Text>. Enter it below
            and choose a new password.
          </Text>

          <TextInput
            ref={codeInputRef}
            value={code}
            onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH))}
            placeholder="______"
            placeholderTextColor={colors.placeholder}
            keyboardAppearance={resolvedTheme}
            style={styles.codeInput}
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            returnKeyType="next"
            autoFocus
            editable={!submitting && !resending}
          />

          <View style={styles.inputShell}>
            <MaterialIcons name="lock-outline" size={21} color={colors.icon} />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="New password"
              placeholderTextColor={colors.placeholder}
              keyboardAppearance={resolvedTheme}
              style={styles.input}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password-new"
              textContentType="newPassword"
              returnKeyType="next"
              editable={!submitting && !resending}
            />
            <Pressable
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              hitSlop={10}
              onPress={() => setShowPassword((v) => !v)}
              style={styles.eyeButton}>
              <MaterialIcons
                name={showPassword ? 'visibility-off' : 'visibility'}
                size={22}
                color={colors.icon}
              />
            </Pressable>
          </View>

          <View style={styles.inputShell}>
            <MaterialIcons name="lock-outline" size={21} color={colors.icon} />
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Confirm new password"
              placeholderTextColor={colors.placeholder}
              keyboardAppearance={resolvedTheme}
              style={styles.input}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password-new"
              textContentType="newPassword"
              returnKeyType="done"
              editable={!submitting && !resending}
              onSubmitEditing={submit}
            />
          </View>

          <Pressable
            style={[
              styles.primaryButton,
              (submitting || resending) && styles.primaryButtonDisabled,
            ]}
            onPress={submit}
            disabled={submitting || resending}>
            {submitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>Reset password</Text>
                <MaterialIcons name="arrow-forward" size={21} color={colors.onPrimary} />
              </>
            )}
          </Pressable>

          <Pressable
            style={styles.resendButton}
            onPress={handleResend}
            disabled={cooldown > 0 || resending || submitting}>
            <Text
              style={[
                styles.resendText,
                (cooldown > 0 || resending || submitting) &&
                  styles.resendTextDisabled,
              ]}>
              {resending
                ? 'Sending new code…'
                : cooldown > 0
                  ? `Resend code in ${cooldown}s`
                  : 'Resend code'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

// Masks the local part so the screen confirms the address without fully
// exposing it: "jane.doe@gmail.com" -> "j******@gmail.com".
function maskEmail(email: string): string {
  if (!email) return 'your email';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  if (local.length <= 1) return `${local}***@${domain}`;
  return `${local[0]}${'*'.repeat(Math.max(local.length - 1, 3))}@${domain}`;
}

const styles = StyleSheet.create({
  loadingState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    alignSelf: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    maxWidth: 480,
    paddingHorizontal: UiSpacing.xxl,
    paddingVertical: UiSpacing.lg,
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
  email: {
    color: '#202124',
    fontWeight: '600',
  },
  codeInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E4EBF7',
    borderRadius: UiRadii.control,
    borderWidth: 1,
    color: '#202124',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 10,
    marginTop: UiSpacing.xxl,
    minHeight: 52,
    paddingHorizontal: UiSpacing.md,
    textAlign: 'center',
    width: '100%',
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: '#F8FAFF',
    borderColor: '#E4EBF7',
    borderRadius: UiRadii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    marginTop: UiSpacing.sm,
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
  eyeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 40,
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
  resendButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: UiSpacing.md,
    minHeight: UiControlHeights.button,
  },
  resendText: {
    color: '#1A73E8',
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  resendTextDisabled: {
    color: '#9AA0A6',
  },
});
