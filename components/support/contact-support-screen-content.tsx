import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/page-header';
import { ScreenShell } from '@/components/screen';
import { SupportRequestSuccess } from '@/components/support/support-request-success';
import { UiControlHeights, UiRadii, UiSpacing, UiTypography } from '@/constants/theme';
import { supportApi } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import type {
  CreateSupportRequestResponse,
  SupportRequestCategory,
} from '@/lib/api/types';
import { getUser } from '@/lib/session';
import {
  clearSupportDraft,
  loadSupportDraft,
  saveSupportDraft,
  type SupportDraft,
  type SupportRequestMode,
} from '@/lib/support/draft';
import { collectClientSupportDiagnostics } from '@/lib/support/diagnostics';
import { useAppTheme } from '@/lib/theme/theme-provider';

const SUPPORT_CATEGORIES: readonly {
  value: Exclude<SupportRequestCategory, 'FEEDBACK'>;
  label: string;
}[] = [
  { value: 'ACCOUNT', label: 'Account access' },
  { value: 'BILLING', label: 'Billing & subscription' },
  { value: 'CRM_GHL', label: 'GoHighLevel' },
  { value: 'CRM_HUBSPOT', label: 'HubSpot' },
  { value: 'OPENAI_ASSISTANT', label: 'OpenAI assistant' },
  { value: 'VOICE', label: 'Voice' },
  { value: 'REMINDERS_NOTIFICATIONS', label: 'Reminders & notifications' },
  { value: 'CONNECTIVITY', label: 'Connectivity' },
  { value: 'PRIVACY_SECURITY', label: 'Privacy & security' },
  { value: 'OTHER', label: 'Something else' },
];

const CATEGORY_VALUES = new Set<SupportRequestCategory>(
  SUPPORT_CATEGORIES.map(({ value }) => value),
);

type FieldState = { category: boolean; subject: boolean; description: boolean };

export function ContactSupportScreenContent({
  mode,
  initialCategory,
  initialSubject,
  initialIncludeDiagnostics,
}: {
  mode: SupportRequestMode;
  initialCategory?: string;
  initialSubject?: string;
  initialIncludeDiagnostics?: boolean;
}) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const user = getUser();
  const userId = user?.id;
  const [draft, setDraft] = useState<SupportDraft | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [touched, setTouched] = useState<FieldState>({ category: false, subject: false, description: false });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateSupportRequestResponse | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const submissionLock = useRef(false);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setHydrated(true);
      return () => {
        active = false;
      };
    }

    void loadSupportDraft(userId, mode).then((stored) => {
      if (!active) return;
      const routeCategory =
        initialCategory && CATEGORY_VALUES.has(initialCategory as SupportRequestCategory)
          ? (initialCategory as SupportRequestCategory)
          : null;
      setDraft({
        ...stored,
        category: mode === 'feedback' ? 'FEEDBACK' : stored.category ?? routeCategory,
        includeDiagnostics: initialIncludeDiagnostics || stored.includeDiagnostics,
        subject: stored.subject || initialSubject || '',
      });
      setHydrated(true);
    });

    return () => {
      active = false;
    };
  }, [initialCategory, initialIncludeDiagnostics, initialSubject, mode, userId]);

  useEffect(() => {
    if (!hydrated || !userId || !draft || result) return;
    const timeout = setTimeout(() => {
      void saveSupportDraft(userId, mode, draft);
    }, 300);
    return () => clearTimeout(timeout);
  }, [draft, hydrated, mode, result, userId]);

  const validation = useMemo(() => {
    const subjectLength = draft?.subject.trim().length ?? 0;
    const descriptionLength = draft?.description.trim().length ?? 0;
    return {
      category: mode === 'feedback' || Boolean(draft?.category),
      subject: subjectLength >= 5 && subjectLength <= 120,
      description: descriptionLength >= 20 && descriptionLength <= 5000,
    };
  }, [draft, mode]);

  function updateDraft(patch: Partial<SupportDraft>) {
    setSubmitError(null);
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  async function submit() {
    if (!draft || !userId || submissionLock.current) return;
    setTouched({ category: true, subject: true, description: true });
    if (!validation.category || !validation.subject || !validation.description) {
      setSubmitError('Check the highlighted fields before submitting.');
      return;
    }

    submissionLock.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const clientDiagnostics = draft.includeDiagnostics
        ? await collectClientSupportDiagnostics()
        : undefined;
      const response = await supportApi.createRequest({
        clientRequestId: draft.clientRequestId,
        category: mode === 'feedback' ? 'FEEDBACK' : draft.category!,
        subject: draft.subject.trim(),
        description: draft.description.trim(),
        includeDiagnostics: draft.includeDiagnostics,
        ...(clientDiagnostics ? { clientDiagnostics } : {}),
      });
      await clearSupportDraft(userId, mode);
      setResult(response);
    } catch (error) {
      setSubmitError(getSupportErrorMessage(error));
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <ScreenShell edges={['bottom']}>
        <PageHeader title={mode === 'feedback' ? 'Product feedback' : 'Contact support'} showBack />
        <ScrollView contentContainerStyle={styles.successScroll}>
          <SupportRequestSuccess
            mode={mode}
            result={result}
            onDone={() => router.replace('/support' as Href)}
          />
        </ScrollView>
      </ScreenShell>
    );
  }

  const subjectLength = draft?.subject.length ?? 0;
  const descriptionLength = draft?.description.length ?? 0;
  const selectedCategory = SUPPORT_CATEGORIES.find(({ value }) => value === draft?.category);

  return (
    <ScreenShell edges={['bottom']}>
      <PageHeader title={mode === 'feedback' ? 'Product feedback' : 'Contact support'} showBack />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {mode === 'feedback' ? 'Help shape AI Concierge' : 'Tell us what happened'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {mode === 'feedback'
                ? 'Share an idea, improvement, or something that feels harder than it should. We read every submission, but a personal reply is not guaranteed.'
                : `Give us the key details and we will associate the request with ${user?.email ?? 'your signed-in account'}.`}
            </Text>
          </View>

          <View
            accessibilityRole="alert"
            style={[
              styles.warning,
              { backgroundColor: colors.warningSurface, borderColor: colors.warningBorder },
            ]}>
            <MaterialIcons name="privacy-tip" size={21} color={colors.warning} />
            <Text style={[styles.warningText, { color: colors.warningText }]}>Do not share passwords, verification codes, CRM tokens, or API keys.</Text>
          </View>

          {!hydrated ? (
            <View accessibilityLabel="Loading saved draft" style={styles.loadingWrap}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading your saved draft...</Text>
            </View>
          ) : !userId || !draft ? (
            <View style={[styles.errorBox, { backgroundColor: colors.dangerSurface, borderColor: colors.dangerBorder }]}>
              <Text style={[styles.errorText, { color: colors.dangerText }]}>Sign in again before sending a request.</Text>
            </View>
          ) : (
            <View style={styles.form}>
              {mode === 'support' ? (
                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>CATEGORY</Text>
                  <Pressable
                    accessibilityLabel={`Support category. ${selectedCategory?.label ?? 'Not selected'}`}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: categoryOpen }}
                    onPress={() => {
                      setTouched((current) => ({ ...current, category: true }));
                      setCategoryOpen(true);
                    }}
                    style={({ pressed }) => [
                      styles.select,
                      {
                        backgroundColor: colors.inputBackground,
                        borderColor: touched.category && !validation.category ? colors.danger : colors.inputBorder,
                      },
                      pressed && { backgroundColor: colors.surfacePressed },
                    ]}>
                    <Text style={[styles.selectText, { color: selectedCategory ? colors.textPrimary : colors.placeholder }]}>{selectedCategory?.label ?? 'Choose a category'}</Text>
                    <MaterialIcons name="expand-more" size={22} color={colors.icon} />
                  </Pressable>
                  {touched.category && !validation.category ? (
                    <FieldError message="Choose a support category." />
                  ) : null}
                </View>
              ) : null}

              <FormField
                count={subjectLength}
                error={touched.subject && !validation.subject ? 'Subject must be 5 to 120 characters.' : undefined}
                label="SUBJECT"
                maxLength={120}
                multiline={false}
                onBlur={() => setTouched((current) => ({ ...current, subject: true }))}
                onChangeText={(subject) => updateDraft({ subject })}
                placeholder={mode === 'feedback' ? 'What would you improve?' : 'Briefly describe the issue'}
                value={draft.subject}
              />

              <FormField
                count={descriptionLength}
                error={touched.description && !validation.description ? 'Description must be 20 to 5,000 characters.' : undefined}
                label={mode === 'feedback' ? 'YOUR FEEDBACK' : 'WHAT HAPPENED?'}
                maxLength={5000}
                multiline
                onBlur={() => setTouched((current) => ({ ...current, description: true }))}
                onChangeText={(description) => updateDraft({ description })}
                placeholder={mode === 'feedback' ? 'Tell us what would make the app work better for you...' : 'What did you try, what did you expect, and what happened instead?'}
                value={draft.description}
              />

              <View
                style={[
                  styles.diagnosticsOption,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}>
                <View style={styles.diagnosticsHeading}>
                  <View style={[styles.diagnosticsIcon, { backgroundColor: colors.primaryMuted }]}>
                    <MaterialIcons name="health-and-safety" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.diagnosticsTitleWrap}>
                    <Text style={[styles.diagnosticsTitle, { color: colors.textPrimary }]}>Include technical diagnostics</Text>
                    <Text style={[styles.diagnosticsStatus, { color: draft.includeDiagnostics ? colors.success : colors.textMuted }]}>
                      {draft.includeDiagnostics ? 'Enabled for this request' : 'Not included'}
                    </Text>
                  </View>
                  <Switch
                    accessibilityHint="Controls whether a safe technical snapshot is included with this request"
                    accessibilityLabel="Include technical diagnostics"
                    accessibilityRole="switch"
                    onValueChange={(includeDiagnostics) => updateDraft({ includeDiagnostics })}
                    thumbColor={draft.includeDiagnostics ? colors.onPrimary : colors.surface}
                    trackColor={{ false: colors.borderStrong, true: colors.primary }}
                    value={draft.includeDiagnostics}
                  />
                </View>
                <Text style={[styles.diagnosticsDescription, { color: colors.textSecondary }]}>Adds app, connection, and account setup checks. It never includes passwords, tokens, API keys, CRM records, messages, or recordings.</Text>
                <Pressable
                  accessibilityRole="link"
                  onPress={() => router.push('/support-diagnostics' as Href)}
                  style={({ pressed }) => [styles.reviewLink, pressed && { backgroundColor: colors.surfacePressed }]}>
                  <Text style={[styles.reviewLinkText, { color: colors.primary }]}>Review diagnostics</Text>
                  <MaterialIcons name="arrow-forward" size={17} color={colors.primary} />
                </Pressable>
              </View>

              <Text style={[styles.draftNote, { color: colors.textMuted }]}>Your draft is saved on this device until it is sent or you sign out.</Text>

              {submitError ? (
                <View accessibilityLiveRegion="assertive" accessibilityRole="alert" style={[styles.errorBox, { backgroundColor: colors.dangerSurface, borderColor: colors.dangerBorder }]}>
                  <MaterialIcons name="error-outline" size={19} color={colors.danger} />
                  <Text style={[styles.errorText, { color: colors.dangerText }]}>{submitError}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: submitting }}
                disabled={submitting}
                onPress={() => void submit()}
                style={({ pressed }) => [
                  styles.submitButton,
                  { backgroundColor: pressed ? colors.primaryPressed : colors.primary },
                  submitting && styles.disabled,
                ]}>
                {submitting ? (
                  <>
                    <ActivityIndicator color={colors.onPrimary} />
                    <Text style={[styles.submitText, { color: colors.onPrimary }]}>Sending...</Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.submitText, { color: colors.onPrimary }]}>{mode === 'feedback' ? 'Send feedback' : 'Send to support'}</Text>
                    <MaterialIcons name="send" size={19} color={colors.onPrimary} />
                  </>
                )}
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        animationType="slide"
        onRequestClose={() => setCategoryOpen(false)}
        presentationStyle="pageSheet"
        transparent={Platform.OS !== 'ios'}
        visible={categoryOpen}>
        <SafeAreaView
          edges={['top', 'bottom']}
          style={[
            styles.modalSafe,
            Platform.OS !== 'ios' && { backgroundColor: colors.scrim },
          ]}>
          <Pressable
            accessibilityLabel="Close category selector"
            onPress={() => setCategoryOpen(false)}
            style={styles.modalBackdrop}>
            <Pressable
              accessibilityRole="none"
              onPress={(event) => event.stopPropagation()}
              style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Choose a category</Text>
                <Pressable
                  accessibilityLabel="Close category selector"
                  accessibilityRole="button"
                  onPress={() => setCategoryOpen(false)}
                  style={({ pressed }) => [styles.modalClose, pressed && { backgroundColor: colors.surfacePressed }]}>
                  <MaterialIcons name="close" size={22} color={colors.icon} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.categoryList}>
                {SUPPORT_CATEGORIES.map((item) => {
                  const selected = draft?.category === item.value;
                  return (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      key={item.value}
                      onPress={() => {
                        updateDraft({ category: item.value });
                        setCategoryOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.categoryRow,
                        selected && { backgroundColor: colors.surfaceSelected },
                        pressed && { backgroundColor: colors.surfacePressed },
                      ]}>
                      <Text style={[styles.categoryText, { color: colors.textPrimary }]}>{item.label}</Text>
                      <MaterialIcons name={selected ? 'radio-button-checked' : 'radio-button-unchecked'} size={22} color={selected ? colors.primary : colors.iconMuted} />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </SafeAreaView>
      </Modal>
    </ScreenShell>
  );
}

function FormField({
  label,
  value,
  placeholder,
  multiline,
  maxLength,
  count,
  error,
  onBlur,
  onChangeText,
}: {
  label: string;
  value: string;
  placeholder: string;
  multiline: boolean;
  maxLength: number;
  count: number;
  error?: string;
  onBlur: () => void;
  onChangeText: (value: string) => void;
}) {
  const { colors, resolvedTheme } = useAppTheme();
  const description = `${label.toLowerCase()}Count`;
  return (
    <View style={styles.fieldGroup}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
        <Text nativeID={description} style={[styles.count, { color: count >= maxLength ? colors.danger : colors.textMuted }]}>{count.toLocaleString()} / {maxLength.toLocaleString()}</Text>
      </View>
      <TextInput
        accessibilityLabel={label.toLowerCase()}
        accessibilityHint={`${count.toLocaleString()} of ${maxLength.toLocaleString()} characters entered${error ? `. ${error}` : ''}`}
        keyboardAppearance={resolvedTheme}
        maxLength={maxLength}
        multiline={multiline}
        onBlur={onBlur}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        selectionColor={colors.selection}
        style={[
          styles.input,
          multiline && styles.descriptionInput,
          {
            backgroundColor: colors.inputBackground,
            borderColor: error ? colors.danger : colors.inputBorder,
            color: colors.textPrimary,
          },
        ]}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
      />
      {error ? <FieldError message={error} /> : null}
    </View>
  );
}

function FieldError({ message }: { message: string }) {
  const { colors } = useAppTheme();
  return (
    <Text accessibilityLiveRegion="polite" style={[styles.fieldError, { color: colors.dangerText }]}>{message}</Text>
  );
}

function getSupportErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'We could not send this request. Your draft is saved; please try again.';
  if (error.status === 0) return 'We could not reach support. Your draft is saved; check your connection and try again.';
  if (error.status === 401) return 'Your session has expired. Sign in again before sending this request.';
  if (error.status === 429) return 'You have sent several requests recently. Please wait and try again later.';
  if (error.status === 400) return error.message || 'Check the request details and try again.';
  if (error.status >= 500) return 'Support is temporarily unavailable. Your draft is saved; please try again.';
  return error.message || 'We could not send this request. Your draft is saved; please try again.';
}

const styles = StyleSheet.create({
  keyboardView: { flex: 1 },
  content: {
    alignSelf: 'center',
    gap: UiSpacing.lg,
    maxWidth: 720,
    paddingBottom: UiSpacing.xxxl,
    paddingHorizontal: UiSpacing.lg,
    paddingTop: UiSpacing.lg,
    width: '100%',
  },
  intro: { gap: UiSpacing.xs },
  title: {
    fontSize: UiTypography.sectionHeading.fontSize,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: UiTypography.sectionHeading.lineHeight,
  },
  subtitle: {
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    maxWidth: 620,
  },
  warning: {
    alignItems: 'flex-start',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    padding: UiSpacing.md,
  },
  warningText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  loadingWrap: { alignItems: 'center', gap: UiSpacing.sm, paddingVertical: UiSpacing.xxxl },
  loadingText: { fontSize: UiTypography.bodySmall.fontSize },
  form: { gap: UiSpacing.lg },
  fieldGroup: { gap: UiSpacing.xs },
  labelRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  label: {
    fontSize: UiTypography.caption.fontSize,
    fontWeight: '800',
    letterSpacing: 0.8,
    lineHeight: UiTypography.caption.lineHeight,
  },
  count: { fontSize: UiTypography.caption.fontSize, fontWeight: '600' },
  select: {
    alignItems: 'center',
    borderRadius: UiRadii.control,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: UiControlHeights.dropdown,
    paddingHorizontal: UiSpacing.md,
  },
  selectText: { flex: 1, fontSize: UiTypography.input.fontSize },
  input: {
    borderRadius: UiRadii.control,
    borderWidth: 1,
    fontSize: UiTypography.input.fontSize,
    lineHeight: UiTypography.input.lineHeight,
    minHeight: UiControlHeights.input,
    paddingHorizontal: UiSpacing.md,
    paddingVertical: UiSpacing.md,
  },
  descriptionInput: { minHeight: UiControlHeights.longTextarea },
  diagnosticsOption: {
    borderRadius: UiRadii.card,
    borderWidth: 1,
    gap: UiSpacing.sm,
    padding: UiSpacing.md,
  },
  diagnosticsHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: UiSpacing.sm,
  },
  diagnosticsIcon: {
    alignItems: 'center',
    borderRadius: UiRadii.icon,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  diagnosticsTitleWrap: { flex: 1, gap: 1 },
  diagnosticsTitle: {
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  diagnosticsStatus: {
    fontSize: UiTypography.caption.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.caption.lineHeight,
  },
  diagnosticsDescription: { fontSize: UiTypography.label.fontSize, lineHeight: 18 },
  reviewLink: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: UiRadii.control,
    flexDirection: 'row',
    gap: UiSpacing.xxs,
    minHeight: UiControlHeights.compactButton,
    paddingHorizontal: UiSpacing.sm,
  },
  reviewLinkText: { fontSize: 13, fontWeight: '700' },
  fieldError: { fontSize: UiTypography.label.fontSize, lineHeight: 17 },
  draftNote: { fontSize: UiTypography.label.fontSize, lineHeight: 18, marginTop: -3 },
  errorBox: {
    alignItems: 'flex-start',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    padding: UiSpacing.md,
  },
  errorText: { flex: 1, fontSize: 13, lineHeight: 19 },
  submitButton: {
    alignItems: 'center',
    borderRadius: UiRadii.control,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    justifyContent: 'center',
    minHeight: UiControlHeights.button,
    paddingHorizontal: UiSpacing.lg,
  },
  submitText: { fontSize: UiTypography.button.fontSize, fontWeight: '700' },
  disabled: { opacity: 0.62 },
  successScroll: { flexGrow: 1, paddingBottom: UiSpacing.xxxl },
  modalSafe: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius: UiRadii.modal,
    borderTopRightRadius: UiRadii.modal,
    maxHeight: '88%',
    overflow: 'hidden',
  },
  modalHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 52,
    paddingLeft: UiSpacing.lg,
    paddingRight: UiSpacing.xs,
  },
  modalTitle: {
    flex: 1,
    fontSize: UiTypography.navigationTitle.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.navigationTitle.lineHeight,
  },
  modalClose: {
    alignItems: 'center',
    borderRadius: UiRadii.control,
    height: UiControlHeights.iconButton,
    justifyContent: 'center',
    width: UiControlHeights.iconButton,
  },
  categoryList: { padding: UiSpacing.sm },
  categoryRow: {
    alignItems: 'center',
    borderRadius: UiRadii.control,
    flexDirection: 'row',
    minHeight: UiControlHeights.dropdown,
    paddingHorizontal: UiSpacing.md,
  },
  categoryText: { flex: 1, fontSize: UiTypography.input.fontSize, fontWeight: '600' },
});
