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
import { useAppTheme } from '@/lib/theme/theme-provider';
import { remindersApi } from '@/lib/api';
import { getMe, signIn, signUp } from '@/lib/api/auth';
import { getApiBaseUrl } from '@/lib/api/base-url';
import { ApiError } from '@/lib/api/client';
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

            {__DEV__ ? (
              <Text style={styles.devApiHint}>API: {getApiBaseUrl() || '(auto)'}</Text>
            ) : null}
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
    paddingHorizontal: 12,
    paddingTop: 22,
    paddingBottom: 120,
  },
  heroCard: {
    backgroundColor: '#EDF4FF',
    borderColor: '#D7E6FF',
    borderRadius: 16,
    borderWidth: 1,
    padding: 22,
    width: '100%',
  },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  logoMark: {
    alignItems: 'center',
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  logoDot: {
    borderRadius: 20,
    position: 'absolute',
  },
  blueDot: {
    backgroundColor: '#4285F4',
    height: 38,
    left: 5,
    width: 38,
  },
  redDot: {
    backgroundColor: '#EA4335',
    height: 24,
    right: 8,
    top: 8,
    width: 24,
  },
  yellowDot: {
    backgroundColor: '#FBBC04',
    bottom: 8,
    height: 22,
    right: 12,
    width: 22,
  },
  greenDot: {
    backgroundColor: '#34A853',
    bottom: 14,
    height: 16,
    left: 16,
    width: 16,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: '#F1F6FF',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  badgeText: {
    color: '#174EA6',
    fontSize: 13,
    fontWeight: '600',
  },
  title: {
    color: '#202124',
    fontSize: 34,
    fontWeight: '600',
    letterSpacing: -1,
    lineHeight: 40,
    marginTop: 26,
  },
  subtitle: {
    color: '#5F6368',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
    maxWidth: 300,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E6EDF8',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 16,
    padding: 20,
    width: '100%',
    shadowColor: '#174EA6',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.08,
    shadowRadius: 26,
  },
  formTitle: {
    color: '#202124',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 14,
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: '#F8FAFF',
    borderColor: '#E4EBF7',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  input: {
    color: '#202124',
    flex: 1,
    fontSize: 16,
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
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 56,
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  forgotButton: {
    alignItems: 'flex-end',
    marginBottom: 2,
    marginTop: -2,
  },
  forgotText: {
    color: '#1A73E8',
    fontSize: 14,
    fontWeight: '600',
  },
  switchButton: {
    alignItems: 'center',
    marginTop: 18,
  },
  switchText: {
    color: '#1A73E8',
    fontSize: 14,
    fontWeight: '600',
  },
  devApiHint: {
    color: '#9AA0A6',
    fontSize: 11,
    marginTop: 16,
    textAlign: 'center',
  },
});
