import AntDesign from '@expo/vector-icons/AntDesign';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { LogoDotsIcon } from '@/components/brand/logo-dots-icon';
import { ScreenShell } from '@/components/screen';
import { useAppTheme } from '@/lib/theme/theme-provider';
import { remindersApi } from '@/lib/api';
import { googleSignIn } from '@/lib/api/auth';
import { GoogleSignInError, signInWithGoogle } from '@/lib/auth/google';
import { routeForUser } from '@/lib/onboarding-route';
import { registerPushToken } from '@/lib/push/register-push-token';
import { setSession } from '@/lib/session';
import { useToast } from '@/lib/toast';

// Fire-and-forget device setup after a session is established (timezone for
// reminder resolution + Expo push token). Mirrors the email/password flow in
// auth-screen.tsx; failures are swallowed and retried on next cold start.
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

// First-run launcher (matches the "Let's Get Started" Figma), rendered in the
// app's light palette for consistency with the rest of onboarding. Offers two
// paths: the email/password form (/signup-email) and native Google sign-in.
export function AuthLanding() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { show } = useToast();
  const [googleBusy, setGoogleBusy] = useState(false);

  async function handleGoogle() {
    if (googleBusy) return;
    setGoogleBusy(true);
    try {
      const idToken = await signInWithGoogle();
      if (!idToken) return; // user dismissed the picker

      const result = await googleSignIn({ idToken });
      await setSession(result.token, result.user);
      attachDevicePreferences();
      router.replace(routeForUser(result.user));
    } catch (err) {
      const message =
        err instanceof GoogleSignInError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Google sign-in failed. Please try again.';
      show(message, 'error');
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <ScreenShell>
      <View style={styles.content}>
        <View style={styles.iconBadge}>
          <LogoDotsIcon size={72} />
        </View>

        <Text style={styles.title}>Let&apos;s get started</Text>
        <Text style={styles.subtitle}>
          Create your AI-Concierge account to automate your CRM.
        </Text>

        <View style={styles.actions}>
          <Pressable
            style={styles.primaryButton}
            disabled={googleBusy}
            onPress={() => router.push('/signup-email' as Href)}>
            <MaterialIcons name="mail-outline" size={20} color={colors.onPrimary} />
            <Text style={styles.primaryButtonText}>Continue with Email</Text>
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            style={[styles.googleButton, googleBusy && styles.googleButtonBusy]}
            disabled={googleBusy}
            onPress={handleGoogle}>
            {googleBusy ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <AntDesign name="google" size={20} color="#EA4335" />
            )}
            <Text style={styles.googleButtonText}>
              {googleBusy ? 'Signing in…' : 'Continue with Google'}
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.footer}
          hitSlop={8}
          disabled={googleBusy}
          onPress={() => router.replace('/signin')}>
          <Text style={styles.footerText}>
            Already have an account? <Text style={styles.footerLink}>Sign in</Text>
          </Text>
        </Pressable>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    color: '#5F6368',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    maxWidth: 300,
    textAlign: 'center',
  },
  actions: {
    marginTop: 36,
    width: '100%',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 56,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  dividerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginVertical: 20,
  },
  dividerLine: {
    backgroundColor: '#E4EBF7',
    flex: 1,
    height: 1,
  },
  dividerText: {
    color: '#9AA0A6',
    fontSize: 14,
    fontWeight: '500',
  },
  googleButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E4EBF7',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 56,
  },
  googleButtonBusy: {
    opacity: 0.7,
  },
  googleButtonText: {
    color: '#202124',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    marginTop: 32,
  },
  footerText: {
    color: '#5F6368',
    fontSize: 14,
  },
  footerLink: {
    color: '#1A73E8',
    fontWeight: '600',
  },
});
