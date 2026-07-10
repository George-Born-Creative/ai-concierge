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

import { LogoDotsIcon } from '@/components/brand/logo-dots-icon';
import { PageHeader } from '@/components/page-header';
import { ScreenShell } from '@/components/screen';
import { requestPasswordReset } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { useToast } from '@/lib/toast';

// Loose client-side check only — the backend is the source of truth.
const EMAIL_RE = /.+@.+\..+/;

export function ForgotPasswordScreen() {
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
      await requestPasswordReset({ email: trimmed });
      // Enumeration-safe: the backend returns { ok: true } regardless, so we
      // always advance and show a neutral message.
      show('If an account exists, we sent a reset code.', 'success');
      router.push(
        `/reset-password?email=${encodeURIComponent(trimmed)}` as Href,
      );
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message || 'Could not start the reset.'
          : 'Something went wrong. Please try again.';
      show(message, 'error');
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
          <View style={styles.iconBadge}>
            <LogoDotsIcon size={72} />
          </View>

          <Text style={styles.title}>Forgot password?</Text>
          <Text style={styles.subtitle}>
            Enter the email for your account and we&apos;ll send you a 6-digit
            code to reset your password.
          </Text>

          <View style={styles.inputShell}>
            <MaterialIcons name="alternate-email" size={21} color="#80868B" />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email address"
              placeholderTextColor="#9AA0A6"
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
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>Send reset code</Text>
                <MaterialIcons name="arrow-forward" size={21} color="#FFFFFF" />
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
  inputShell: {
    alignItems: 'center',
    backgroundColor: '#F8FAFF',
    borderColor: '#E4EBF7',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 28,
    minHeight: 54,
    paddingHorizontal: 16,
    width: '100%',
  },
  input: {
    color: '#202124',
    flex: 1,
    fontSize: 16,
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
  switchButton: {
    alignItems: 'center',
    marginTop: 20,
  },
  switchText: {
    color: '#5F6368',
    fontSize: 14,
    fontWeight: '500',
  },
});
