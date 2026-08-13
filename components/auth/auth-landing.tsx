import AntDesign from '@expo/vector-icons/AntDesign';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { LogoDotsIcon } from '@/components/brand/logo-dots-icon';
import { ScreenShell } from '@/components/screen';
import {
  UiControlHeights,
  UiRadii,
  UiSpacing,
  UiTypography,
} from '@/constants/theme';
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
          <LogoDotsIcon size={64} />
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
    paddingHorizontal: UiSpacing.xxl,
    paddingVertical: UiSpacing.xxl,
  },
  iconBadge: {
    alignItems: 'center',
    backgroundColor: '#EDF4FF',
    borderColor: '#D7E6FF',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    height: 96,
    justifyContent: 'center',
    marginBottom: UiSpacing.xxl,
    width: 96,
  },
  title: {
    color: '#202124',
    fontSize: UiTypography.display.fontSize,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: UiTypography.display.lineHeight,
    textAlign: 'center',
  },
  subtitle: {
    color: '#5F6368',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    marginTop: UiSpacing.sm,
    maxWidth: 320,
    textAlign: 'center',
  },
  actions: {
    marginTop: UiSpacing.xxl,
    maxWidth: 440,
    width: '100%',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: UiRadii.control,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    justifyContent: 'center',
    minHeight: UiControlHeights.button,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: UiTypography.button.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.button.lineHeight,
  },
  dividerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: UiSpacing.sm,
    marginVertical: UiSpacing.lg,
  },
  dividerLine: {
    backgroundColor: '#E4EBF7',
    flex: 1,
    height: 1,
  },
  dividerText: {
    color: '#9AA0A6',
    fontSize: UiTypography.label.fontSize,
    fontWeight: '500',
    lineHeight: UiTypography.label.lineHeight,
  },
  googleButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E4EBF7',
    borderRadius: UiRadii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    justifyContent: 'center',
    minHeight: UiControlHeights.button,
  },
  googleButtonBusy: {
    opacity: 0.7,
  },
  googleButtonText: {
    color: '#202124',
    fontSize: UiTypography.button.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.button.lineHeight,
  },
  footer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: UiSpacing.xxl,
    minHeight: UiControlHeights.button,
  },
  footerText: {
    color: '#5F6368',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  footerLink: {
    color: '#1A73E8',
    fontWeight: '600',
  },
});
