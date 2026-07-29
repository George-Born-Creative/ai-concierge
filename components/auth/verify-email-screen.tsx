import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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

import { LogoDotsIcon } from '@/components/brand/logo-dots-icon';
import { ScreenShell } from '@/components/screen';
import { useAppTheme } from '@/lib/theme/theme-provider';
import { resendCode, verifyEmail } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import {
  clearOtpCooldown,
  getOtpCooldownRemaining,
  OTP_RESEND_COOLDOWN_SECONDS,
  startOtpCooldown,
} from '@/lib/auth/otp-cooldown';
import { getOtpErrorMessage } from '@/lib/auth/otp-error';
import { routeForUser } from '@/lib/onboarding-route';
import {
  clearSession,
  hydrateSession,
  refreshUser,
} from '@/lib/session';
import { useToast } from '@/lib/toast';

const CODE_LENGTH = 6;

export function VerifyEmailScreen() {
  const { colors, resolvedTheme } = useAppTheme();
  const router = useRouter();
  const { show } = useToast();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [cooldown, setCooldown] = useState(0);
  const [email, setEmail] = useState<string | null>(null);
  const codeInputRef = useRef<TextInput>(null);
  const redirected = useRef(false);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      const session = await hydrateSession();
      if (!active || redirected.current) return;

      if (!session.token || !session.user) {
        redirected.current = true;
        show('Sign in to request a new verification code.', 'error');
        router.replace('/signin');
        return;
      }

      if (session.user.emailVerified !== false) {
        redirected.current = true;
        router.replace(routeForUser(session.user));
        return;
      }

      const recipient = session.user.email;
      const remaining = await getOtpCooldownRemaining(
        'email-verification',
        recipient,
      );
      if (!active) return;

      setEmail(recipient);
      setCooldown(remaining);
      setCheckingSession(false);
    }

    void loadSession();
    return () => {
      active = false;
    };
  }, [router, show]);

  // Tick the resend cooldown down to zero.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function submitCode() {
    if (code.length !== CODE_LENGTH) {
      show(`Enter the ${CODE_LENGTH}-digit code from your email.`, 'error');
      return;
    }

    setSubmitting(true);
    try {
      const user = await verifyEmail(code);
      await clearOtpCooldown('email-verification', user.email);
      await refreshUser(user);
      if (redirected.current) return;
      redirected.current = true;
      show('Email verified.', 'success');
      router.replace(routeForUser(user));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await clearSession();
        if (!redirected.current) {
          redirected.current = true;
          show(getOtpErrorMessage(err, 'Verification failed.'), 'error');
          router.replace('/signin');
        }
        return;
      }
      show(getOtpErrorMessage(err, 'Verification failed.'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || resending || submitting || !email) return;
    setResending(true);
    try {
      const result = await resendCode();
      const nextCooldown =
        result.retryAfterSeconds ?? OTP_RESEND_COOLDOWN_SECONDS;
      await startOtpCooldown(
        'email-verification',
        email,
        nextCooldown,
      );
      setCode('');
      setCooldown(Math.ceil(nextCooldown));
      codeInputRef.current?.focus();
      show('A new code is on its way.', 'success');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await clearSession();
        if (!redirected.current) {
          redirected.current = true;
          show(getOtpErrorMessage(err, 'Could not resend the code.'), 'error');
          router.replace('/signin');
        }
        return;
      }
      show(getOtpErrorMessage(err, 'Could not resend the code.'), 'error');
    } finally {
      setResending(false);
    }
  }

  async function handleUseAnotherEmail() {
    if (email) {
      await clearOtpCooldown('email-verification', email);
    }
    await clearSession();
    router.replace('/signup');
  }

  if (checkingSession) {
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <View style={styles.content}>
          <View style={styles.iconBadge}>
            <LogoDotsIcon size={72} />
          </View>

          <Text style={styles.title}>Verify your email</Text>
          <Text style={styles.subtitle}>
            We sent a {CODE_LENGTH}-digit code to{' '}
            <Text style={styles.email}>{maskEmail(email)}</Text>. Enter it below
            to finish setting up your account.
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
            returnKeyType="done"
            autoFocus
            editable={!submitting && !resending}
            onSubmitEditing={submitCode}
          />

          <Pressable
            style={[
              styles.primaryButton,
              (submitting || resending) && styles.primaryButtonDisabled,
            ]}
            onPress={submitCode}
            disabled={submitting || resending}>
            {submitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>Verify</Text>
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

          <Pressable
            style={styles.switchButton}
            disabled={submitting || resending}
            onPress={handleUseAnotherEmail}>
            <Text style={styles.switchText}>Use a different email</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

// Masks the local part so the screen confirms the address without fully
// exposing it: "jane.doe@gmail.com" -> "j******@gmail.com".
function maskEmail(email: string | null): string {
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
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  iconBadge: {
    alignItems: 'center',
    backgroundColor: '#EDF4FF',
    borderColor: '#D7E6FF',
    borderRadius: 28,
    borderWidth: 1,
    height: 120,
    justifyContent: 'center',
    marginBottom: 28,
    width: 120,
  },
  title: {
    color: '#202124',
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    color: '#5F6368',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    maxWidth: 320,
    textAlign: 'center',
  },
  email: {
    color: '#202124',
    fontWeight: '600',
  },
  codeInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E4EBF7',
    borderRadius: 14,
    borderWidth: 1,
    color: '#202124',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 12,
    marginTop: 28,
    minHeight: 64,
    paddingHorizontal: 16,
    textAlign: 'center',
    width: '100%',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 56,
    width: '100%',
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  resendButton: {
    alignItems: 'center',
    marginTop: 20,
    minHeight: 40,
    justifyContent: 'center',
  },
  resendText: {
    color: '#1A73E8',
    fontSize: 15,
    fontWeight: '600',
  },
  resendTextDisabled: {
    color: '#9AA0A6',
  },
  switchButton: {
    alignItems: 'center',
    marginTop: 8,
  },
  switchText: {
    color: '#5F6368',
    fontSize: 14,
    fontWeight: '500',
  },
});
