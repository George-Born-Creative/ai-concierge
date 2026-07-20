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
import { useAppTheme } from '@/lib/theme/theme-provider';
import { requestPasswordReset, resetPassword } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { useToast } from '@/lib/toast';

const CODE_LENGTH = 6;
const MIN_PASSWORD_LENGTH = 8;
// The backend enforces a ~30s resend cooldown, so start the client countdown on
// mount to match (a code was just sent from the previous screen).
const RESEND_COOLDOWN_SECONDS = 30;

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
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const redirected = useRef(false);

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
      if (redirected.current) return;
      redirected.current = true;
      show('Password updated — sign in with your new password.', 'success');
      router.replace('/signin');
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message || 'Could not reset your password.'
          : 'Something went wrong. Please try again.';
      show(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || !email) return;
    try {
      await requestPasswordReset({ email });
      setCode('');
      setCooldown(RESEND_COOLDOWN_SECONDS);
      show('A new code is on its way.', 'success');
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Could not resend the code.';
      show(message, 'error');
    }
  }

  return (
    <ScreenShell>
      <PageHeader showBack onBack={() => router.replace('/signin')} />
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
                <Text style={styles.primaryButtonText}>Reset password</Text>
                <MaterialIcons name="arrow-forward" size={21} color={colors.onPrimary} />
              </>
            )}
          </Pressable>

          <Pressable
            style={styles.resendButton}
            onPress={handleResend}
            disabled={cooldown > 0}>
            <Text style={[styles.resendText, cooldown > 0 && styles.resendTextDisabled]}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
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
  keyboardView: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
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
  inputShell: {
    alignItems: 'center',
    backgroundColor: '#F8FAFF',
    borderColor: '#E4EBF7',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    minHeight: 54,
    paddingHorizontal: 16,
    width: '100%',
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
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 40,
  },
  resendText: {
    color: '#1A73E8',
    fontSize: 15,
    fontWeight: '600',
  },
  resendTextDisabled: {
    color: '#9AA0A6',
  },
});
