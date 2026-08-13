import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import { updateMe } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { getUser, refreshUser } from '@/lib/session';
import { useAppTheme } from '@/lib/theme/theme-provider';
import { useToast } from '@/lib/toast';

export function EditProfileScreenContent() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { show } = useToast();
  const initial = getUser();

  const [name, setName] = useState(initial?.name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim().toLowerCase();
  const wantsPasswordChange = newPassword.length > 0 || confirmPassword.length > 0;

  const nameChanged = trimmedName.length > 0 && trimmedName !== (initial?.name ?? '');
  const emailChanged =
    trimmedEmail.length > 0 && trimmedEmail !== (initial?.email ?? '').toLowerCase();
  const hasAnyChange = nameChanged || emailChanged || wantsPasswordChange;

  async function handleSave() {
    if (submitting || !hasAnyChange) return;

    if (trimmedName.length > 0 && trimmedName.length < 2) {
      show('Name must be at least 2 characters.', 'error');
      return;
    }
    if (emailChanged && !isLikelyEmail(trimmedEmail)) {
      show('That email does not look right.', 'error');
      return;
    }
    if (wantsPasswordChange) {
      if (newPassword.length < 8) {
        show('New password must be at least 8 characters.', 'error');
        return;
      }
      if (newPassword !== confirmPassword) {
        show('New password and confirmation do not match.', 'error');
        return;
      }
      if (!currentPassword) {
        show('Enter your current password to change it.', 'error');
        return;
      }
    }

    setSubmitting(true);
    try {
      const updated = await updateMe({
        name: nameChanged ? trimmedName : undefined,
        email: emailChanged ? trimmedEmail : undefined,
        currentPassword: wantsPasswordChange ? currentPassword : undefined,
        newPassword: wantsPasswordChange ? newPassword : undefined,
      });
      await refreshUser(updated);
      show('Profile updated.', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      router.back();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not update profile.';
      show(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenShell edges={['bottom']}>
      <PageHeader title="Edit profile" showBack onBack={() => router.back()} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kbView}
        keyboardVerticalOffset={0}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          alwaysBounceVertical={false}
          overScrollMode="never">
          <Text style={styles.subtitle}>
            Update your name, email, or password. Leave password fields empty to keep it unchanged.
          </Text>

          {/* ── Account info ──────────────────────────────────────────────── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="person" size={22} color={colors.primary} />
              <Text style={styles.cardTitle}>Account info</Text>
            </View>

            <Field
              label="Full name"
              value={name}
              onChangeText={setName}
              placeholder="Jane Doe"
              autoCapitalize="words"
              textContentType="name"
            />

            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
          </View>

          {/* ── Password ─────────────────────────────────────────────────── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="lock" size={22} color={colors.primary} />
              <Text style={styles.cardTitle}>Change password</Text>
            </View>

            <Field
              label="Current password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Required only when setting a new password"
              secureTextEntry
              textContentType="password"
              autoCapitalize="none"
            />

            <Field
              label="New password"
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="At least 8 characters"
              secureTextEntry
              textContentType="newPassword"
              autoCapitalize="none"
            />

            <Field
              label="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Repeat new password"
              secureTextEntry
              textContentType="newPassword"
              autoCapitalize="none"
            />
          </View>

          <Pressable
            style={[
              styles.primaryButton,
              (!hasAnyChange || submitting) && styles.buttonDisabled,
            ]}
            onPress={() => void handleSave()}
            disabled={!hasAnyChange || submitting}>
            {submitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.primaryButtonText}>Save changes</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={() => router.back()}
            disabled={submitting}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address';
  textContentType?:
    | 'name'
    | 'emailAddress'
    | 'password'
    | 'newPassword'
    | 'none';
};

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize = 'sentences',
  keyboardType = 'default',
  textContentType,
}: FieldProps) {
  const { colors, resolvedTheme } = useAppTheme();
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        keyboardAppearance={resolvedTheme}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        textContentType={textContentType}
        style={styles.input}
      />
    </View>
  );
}

function isLikelyEmail(value: string): boolean {
  return /.+@.+\..+/.test(value);
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  kbView: { flex: 1 },
  content: {
    alignSelf: 'center',
    gap: UiSpacing.md,
    maxWidth: 640,
    paddingBottom: UiSpacing.xxxl,
    paddingHorizontal: UiSpacing.lg,
    paddingTop: UiSpacing.lg,
    width: '100%',
  },
  subtitle: {
    color: '#5F6368',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    gap: UiSpacing.md,
    padding: UiSpacing.lg,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: UiSpacing.sm,
  },
  cardTitle: {
    color: '#202124',
    fontSize: UiTypography.cardHeading.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.cardHeading.lineHeight,
  },
  fieldGroup: {
    gap: UiSpacing.xs,
  },
  fieldLabel: {
    color: '#5F6368',
    fontSize: UiTypography.label.fontSize,
    fontWeight: '600',
    letterSpacing: 0.4,
    lineHeight: UiTypography.label.lineHeight,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#F1F3F4',
    borderRadius: UiRadii.control,
    color: '#202124',
    fontSize: UiTypography.input.fontSize,
    lineHeight: UiTypography.input.lineHeight,
    minHeight: UiControlHeights.input,
    paddingHorizontal: UiSpacing.md,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: UiRadii.control,
    justifyContent: 'center',
    marginTop: UiSpacing.xxs,
    minHeight: UiControlHeights.button,
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: UiTypography.button.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.button.lineHeight,
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: UiControlHeights.button,
  },
  secondaryButtonText: {
    color: '#5F6368',
    fontSize: UiTypography.button.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.button.lineHeight,
  },
});
