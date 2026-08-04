import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter, type Href } from 'expo-router';
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
import { remindersApi } from '@/lib/api';
import { getMe, signIn, signUp } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { startOtpCooldown } from '@/lib/auth/otp-cooldown';
import { routeForUser } from '@/lib/onboarding-route';
import { registerPushToken } from '@/lib/push/register-push-token';
import { clearSession, getToken, getUser, hydrateSession, setSession } from '@/lib/session';
import { useToast } from '@/lib/toast';

// Fire-and-forget: after a session is established, send the device's IANA tz
// so the assistant can resolve reminder times correctly, and register the
// Expo push token so reminders can fire. Failures are swallowed - the token
// retries on next cold start, and timezone is cosmetic until first use.
function attachDevicePreferences() {
  try {
    const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detectedTz) {
      void remindersApi.setTimezone(detectedTz).catch(() => undefined);
    }
  } catch {
    // Intl can fail on very old runtimes; skip.
  }
  void registerPushToken();
}

const SESSION_CHECK_TIMEOUT_MS = 6_000;

type AuthMode = 'signin' | 'signup';

type AuthScreenProps = {
  mode: AuthMode;
};

export function AuthScreen({ mode }: AuthScreenProps) {
  const { colors, resolvedTheme } = useAppTheme();
  const router = useRouter();
  const { show } = useToast();
  const isSignup = mode === 'signup';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const redirected = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function checkExistingSession() {
      try {
        await hydrateSession();
        const token = getToken();
        if (!token) return;

        try {
          const me = await withTimeout(getMe(), SESSION_CHECK_TIMEOUT_MS);
          if (cancelled || redirected.current) return;
          await setSession(token, me);
          attachDevicePreferences();
          redirected.current = true;
          router.replace(routeForUser(me));
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            await clearSession();
            return;
          }
          const cached = getUser();
          if (cached && !cancelled && !redirected.current) {
            redirected.current = true;
            router.replace(routeForUser(cached));
          }
        }
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    }

    void checkExistingSession();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function submitAuthForm() {
    if (isSignup && !name.trim()) {
      show('Enter your full name to create an account.', 'error');
      return;
    }

    if (!email.trim() || !password.trim()) {
      show('Enter your email and password to continue.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const result = isSignup
        ? await signUp({ name: name.trim(), email: email.trim(), password })
        : await signIn({ email: email.trim(), password });

      await setSession(result.token, result.user);
      if (isSignup && result.user.emailVerified === false) {
        // The current signup response does not expose Twilio delivery status,
        // so treat a successful signup as the start of the initial cooldown.
        await startOtpCooldown('email-verification', result.user.email);
      }
      attachDevicePreferences();

      if (!isSignup) {
        show('Signed in successfully.', 'success');
      }
      router.replace(routeForUser(result.user));
    } catch (err) {
      const message =
        err instanceof ApiError
          ? humanizeError(err)
          : err instanceof Error
            ? err.message
            : 'Something went wrong. Please try again.';
      show(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function humanizeError(err: ApiError): string {
    if (err.status === 409) return 'An account with this email already exists.';
    if (err.status === 401) return 'Invalid email or password.';
    return err.message || 'Authentication failed.';
  }

  if (checkingSession) {
    return (
      <ScreenShell>
        <View style={styles.sessionCheck}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <PageHeader showBack onBack={() => router.replace('/signup')} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={false}
          overScrollMode="never">
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.logoMark}>
                <View style={[styles.logoDot, styles.blueDot]} />
                <View style={[styles.logoDot, styles.redDot]} />
                <View style={[styles.logoDot, styles.yellowDot]} />
                <View style={[styles.logoDot, styles.greenDot]} />
              </View>

              <View style={styles.badge}>
                <MaterialIcons name="auto-awesome" size={16} color={colors.primary} />
                <Text style={styles.badgeText}>AI-Concierge</Text>
              </View>
            </View>

            <Text style={styles.title}>{isSignup ? 'Create your account' : 'Welcome back'}</Text>
            <Text style={styles.subtitle}>
              {isSignup
                ? 'Set up your assistant profile and continue to plan selection.'
                : 'Sign in to continue to your concierge workspace.'}
            </Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>{isSignup ? 'Account details' : 'Sign in details'}</Text>

            {isSignup ? (
              <View style={styles.inputShell}>
                <MaterialIcons name="person-outline" size={22} color={colors.icon} />
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Full name"
                  placeholderTextColor={colors.placeholder}
                  keyboardAppearance={resolvedTheme}
                  style={styles.input}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            ) : null}

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
                keyboardType="email-address"
                returnKeyType="next"
              />
            </View>
            <View style={styles.inputShell}>
              <MaterialIcons name="lock-outline" size={21} color={colors.icon} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={colors.placeholder}
                keyboardAppearance={resolvedTheme}
                style={styles.input}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={isSignup ? 'password-new' : 'password'}
                textContentType={isSignup ? 'newPassword' : 'password'}
                returnKeyType="done"
                onSubmitEditing={submitAuthForm}
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

            {!isSignup ? (
              <Pressable
                style={styles.forgotButton}
                hitSlop={8}
                onPress={() => router.push('/forgot-password' as Href)}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>
            ) : null}

            <Pressable
              style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
              onPress={submitAuthForm}
              disabled={submitting}>
              <Text style={styles.primaryButtonText}>
                {submitting
                  ? isSignup
                    ? 'Creating account…'
                    : 'Signing in…'
                  : isSignup
                    ? 'Create account'
                    : 'Sign in'}
              </Text>
              {!submitting ? (
                <MaterialIcons name="arrow-forward" size={21} color={colors.onPrimary} />
              ) : null}
            </Pressable>

            <Pressable
              style={styles.switchButton}
              onPress={() => router.replace(isSignup ? '/signin' : '/signup')}>
              <Text style={styles.switchText}>
                {isSignup ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </Text>
            </Pressable>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Request timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(t);
        resolve(value);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      },
    );
  });
}

const styles = StyleSheet.create({
  sessionCheck: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 64,
    paddingHorizontal: UiSpacing.lg,
    paddingTop: UiSpacing.lg,
  },
  heroCard: {
    backgroundColor: '#EDF4FF',
    borderColor: '#D7E6FF',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    maxWidth: 520,
    padding: UiSpacing.lg,
    width: '100%',
  },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  logoMark: {
    alignItems: 'center',
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  logoDot: {
    borderRadius: 20,
    position: 'absolute',
  },
  blueDot: {
    backgroundColor: '#4285F4',
    height: 34,
    left: 5,
    width: 34,
  },
  redDot: {
    backgroundColor: '#EA4335',
    height: 21,
    right: 6,
    top: 7,
    width: 21,
  },
  yellowDot: {
    backgroundColor: '#FBBC04',
    bottom: 7,
    height: 19,
    right: 10,
    width: 19,
  },
  greenDot: {
    backgroundColor: '#34A853',
    bottom: 12,
    height: 14,
    left: 14,
    width: 14,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: '#F1F6FF',
    borderRadius: UiRadii.pill,
    flexDirection: 'row',
    gap: UiSpacing.xs,
    paddingHorizontal: UiSpacing.md,
    paddingVertical: UiSpacing.xs,
  },
  badgeText: {
    color: '#174EA6',
    fontSize: UiTypography.label.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.label.lineHeight,
  },
  title: {
    color: '#202124',
    fontSize: UiTypography.display.fontSize,
    fontWeight: '600',
    letterSpacing: -0.7,
    lineHeight: UiTypography.display.lineHeight,
    marginTop: UiSpacing.xl,
  },
  subtitle: {
    color: '#5F6368',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    marginTop: UiSpacing.sm,
    maxWidth: 360,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E6EDF8',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    marginTop: UiSpacing.md,
    maxWidth: 520,
    padding: UiSpacing.lg,
    width: '100%',
    shadowColor: '#174EA6',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.08,
    shadowRadius: 26,
  },
  formTitle: {
    color: '#202124',
    fontSize: UiTypography.cardHeading.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.cardHeading.lineHeight,
    marginBottom: UiSpacing.md,
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: '#F8FAFF',
    borderColor: '#E4EBF7',
    borderRadius: UiRadii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    marginBottom: UiSpacing.sm,
    minHeight: UiControlHeights.input,
    paddingHorizontal: UiSpacing.md,
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
    marginTop: UiSpacing.sm,
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
  forgotButton: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minHeight: UiControlHeights.compactButton,
  },
  forgotText: {
    color: '#1A73E8',
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  switchButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: UiSpacing.sm,
    minHeight: UiControlHeights.compactButton,
  },
  switchText: {
    color: '#1A73E8',
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
});
