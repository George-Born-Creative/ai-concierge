import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PageHeader } from '@/components/page-header';
import { ScreenShell } from '@/components/screen';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { DiagnosticRow } from '@/components/support/diagnostic-row';
import { UiControlHeights, UiRadii, UiSpacing, UiTypography } from '@/constants/theme';
import { supportApi } from '@/lib/api';
import type {
  ClientSupportDiagnostics,
  SupportDiagnosticGroup,
  SupportDiagnosticsResponse,
} from '@/lib/api/types';
import {
  buildClientDiagnosticGroup,
  collectClientSupportDiagnostics,
} from '@/lib/support/diagnostics';
import { useAppTheme } from '@/lib/theme/theme-provider';
import { useToast } from '@/lib/toast';

type DiagnosticRun = {
  client: ClientSupportDiagnostics;
  server: SupportDiagnosticsResponse;
};

type SummaryCounts = Record<'ok' | 'warning' | 'error', number>;

export function SupportDiagnosticsScreenContent() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { show } = useToast();
  const [result, setResult] = useState<DiagnosticRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const runDiagnostics = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [client, server] = await Promise.all([
        collectClientSupportDiagnostics(),
        supportApi.getDiagnostics(),
      ]);
      setResult({ client, server });
    } catch {
      setResult(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void runDiagnostics();
  }, [runDiagnostics]);

  const groups = useMemo<SupportDiagnosticGroup[]>(
    () =>
      result
        ? [buildClientDiagnosticGroup(result.client), ...result.server.groups]
        : [],
    [result],
  );
  const counts = useMemo(() => countStatuses(groups), [groups]);

  async function copyDetails() {
    if (!result) return;
    await Clipboard.setStringAsync(
      JSON.stringify(
        {
          client: result.client,
          server: result.server,
        },
        null,
        2,
      ),
    );
    show('Technical details copied', 'success');
  }

  function contactSupport() {
    router.push('/contact-support?mode=support&includeDiagnostics=1' as Href);
  }

  if (loading) {
    return <PageSkeleton title="Support diagnostics" />;
  }

  return (
    <ScreenShell edges={['bottom']}>
      <PageHeader title="Support diagnostics" showBack />
      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={styles.content}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <View style={[styles.introIcon, { backgroundColor: colors.primaryMuted }]}>
            <MaterialIcons name="health-and-safety" size={24} color={colors.primary} />
          </View>
          <View style={styles.introCopy}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>Check what support can see</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Run a safe, read-only check of this app and your account setup. Nothing is attached until you choose to include it in a support request.</Text>
          </View>
        </View>

        <View
          style={[
            styles.privacyPanel,
            { backgroundColor: colors.infoSurface, borderColor: colors.infoBorder },
          ]}>
          <MaterialIcons name="verified-user" size={21} color={colors.info} />
          <View style={styles.privacyCopy}>
            <Text style={[styles.privacyTitle, { color: colors.infoText }]}>Designed for privacy</Text>
            <Text style={[styles.privacyText, { color: colors.infoText }]}>
              Collected: app and build version, platform and OS, app environment, locale and time zone, network type and reachability, notification status, API hostname and reachability, plus account and service configuration.
            </Text>
            <Text style={[styles.privacyText, { color: colors.infoText }]}>
              Never collected: passwords, tokens, API keys, full URLs, device identifiers, CRM records, messages, or recordings.
            </Text>
          </View>
        </View>

        {error ? (
          <ErrorState onRetry={() => void runDiagnostics()} />
        ) : result ? (
          <>
            <SummaryBand counts={counts} />

            <View style={styles.groupStack}>
              {groups.map((group) => (
                <View key={group.key} style={styles.group}>
                  <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>{group.label.toUpperCase()}</Text>
                  <View
                    style={[
                      styles.groupCard,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}>
                    {group.items.map((item, index) => (
                      <View key={item.key}>
                        {index > 0 ? (
                          <View style={[styles.divider, { backgroundColor: colors.divider }]} />
                        ) : null}
                        <DiagnosticRow item={item} />
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>

            <Text style={[styles.generatedAt, { color: colors.textMuted }]}>
              Generated {formatTimestamp(result.server.generatedAt)}. Results are a snapshot and may change.
            </Text>

            <View style={styles.secondaryActions}>
              <SecondaryAction
                icon="refresh"
                label="Run again"
                onPress={() => void runDiagnostics()}
              />
              <SecondaryAction
                icon="content-copy"
                label="Copy details"
                onPress={() => void copyDetails()}
              />
            </View>

            <Pressable
              accessibilityHint="Opens the support form with technical diagnostics enabled"
              accessibilityRole="button"
              onPress={contactSupport}
              style={({ pressed }) => [
                styles.primaryAction,
                { backgroundColor: pressed ? colors.primaryPressed : colors.primary },
              ]}>
              <Text style={[styles.primaryActionText, { color: colors.onPrimary }]}>Continue to contact support</Text>
              <MaterialIcons name="arrow-forward" size={20} color={colors.onPrimary} />
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </ScreenShell>
  );
}


function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { colors } = useAppTheme();
  return (
    <View
      accessibilityRole="alert"
      style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.stateIcon, { backgroundColor: colors.warningSurface }]}>
        <MaterialIcons name="cloud-off" size={25} color={colors.warning} />
      </View>
      <Text style={[styles.stateTitle, { color: colors.textPrimary }]}>We could not complete the check</Text>
      <Text style={[styles.stateText, { color: colors.textSecondary }]}>Your details were not attached or saved. Check your connection, then try again.</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [
          styles.retryButton,
          { borderColor: colors.borderStrong },
          pressed && { backgroundColor: colors.surfacePressed },
        ]}>
        <MaterialIcons name="refresh" size={19} color={colors.primary} />
        <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
      </Pressable>
    </View>
  );
}

function SummaryBand({ counts }: { counts: SummaryCounts }) {
  const { colors } = useAppTheme();
  return (
    <View
      accessibilityLabel={`${counts.ok} healthy, ${counts.warning} need attention, ${counts.error} unavailable`}
      style={[styles.summaryBand, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <SummaryItem color={colors.success} count={counts.ok} icon="check-circle" label="Healthy" />
      <View style={[styles.summaryDivider, { backgroundColor: colors.divider }]} />
      <SummaryItem color={colors.warning} count={counts.warning} icon="warning" label="Attention" />
      <View style={[styles.summaryDivider, { backgroundColor: colors.divider }]} />
      <SummaryItem color={colors.danger} count={counts.error} icon="error" label="Unavailable" />
    </View>
  );
}

function SummaryItem({
  color,
  count,
  icon,
  label,
}: {
  color: string;
  count: number;
  icon: 'check-circle' | 'warning' | 'error';
  label: string;
}) {
  return (
    <View style={styles.summaryItem}>
      <MaterialIcons name={icon} size={18} color={color} />
      <Text style={[styles.summaryCount, { color }]}>{count}</Text>
      <Text style={[styles.summaryLabel, { color }]}>{label}</Text>
    </View>
  );
}

function SecondaryAction({
  icon,
  label,
  onPress,
}: {
  icon: 'refresh' | 'content-copy';
  label: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryAction,
        { borderColor: colors.borderStrong },
        pressed && { backgroundColor: colors.surfacePressed },
      ]}>
      <MaterialIcons name={icon} size={19} color={colors.primary} />
      <Text style={[styles.secondaryActionText, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

function countStatuses(groups: SupportDiagnosticGroup[]): SummaryCounts {
  return groups.reduce<SummaryCounts>(
    (counts, group) => {
      group.items.forEach((item) => {
        if (item.status !== 'info') counts[item.status] += 1;
      });
      return counts;
    },
    { ok: 0, warning: 0, error: 0 },
  );
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'just now';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    gap: UiSpacing.lg,
    maxWidth: 720,
    paddingBottom: UiSpacing.xxxl,
    paddingHorizontal: UiSpacing.lg,
    paddingTop: UiSpacing.lg,
    width: '100%',
  },
  intro: { alignItems: 'flex-start', flexDirection: 'row', gap: UiSpacing.md },
  introIcon: {
    alignItems: 'center',
    borderRadius: UiRadii.icon,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  introCopy: { flex: 1, gap: UiSpacing.xxs, paddingTop: 1 },
  title: {
    fontSize: UiTypography.sectionHeading.fontSize,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: UiTypography.sectionHeading.lineHeight,
  },
  subtitle: {
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  privacyPanel: {
    alignItems: 'flex-start',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    padding: UiSpacing.md,
  },
  privacyCopy: { flex: 1, gap: UiSpacing.xxs },
  privacyTitle: { fontSize: UiTypography.bodySmall.fontSize, fontWeight: '800', lineHeight: 19 },
  privacyText: { fontSize: UiTypography.label.fontSize, lineHeight: 18 },
  stateCard: {
    alignItems: 'center',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    gap: UiSpacing.sm,
    paddingHorizontal: UiSpacing.xl,
    paddingVertical: UiSpacing.xxl,
  },
  stateIcon: {
    alignItems: 'center',
    borderRadius: UiRadii.icon,
    height: 44,
    justifyContent: 'center',
    marginBottom: 2,
    width: 44,
  },
  stateTitle: {
    fontSize: UiTypography.cardHeading.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.cardHeading.lineHeight,
    textAlign: 'center',
  },
  stateText: {
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    maxWidth: 420,
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    borderRadius: UiRadii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.xs,
    justifyContent: 'center',
    marginTop: UiSpacing.xxs,
    minHeight: UiControlHeights.button,
    paddingHorizontal: UiSpacing.lg,
  },
  retryText: { fontSize: UiTypography.button.fontSize, fontWeight: '700' },
  summaryBand: {
    alignItems: 'stretch',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 68,
    overflow: 'hidden',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
    gap: 1,
    justifyContent: 'center',
    paddingHorizontal: UiSpacing.xxs,
    paddingVertical: UiSpacing.sm,
  },
  summaryCount: { fontSize: 17, fontWeight: '800', lineHeight: 22 },
  summaryLabel: { fontSize: 10, fontWeight: '700', lineHeight: 14 },
  summaryDivider: { alignSelf: 'stretch', width: 1 },
  groupStack: { gap: UiSpacing.lg },
  group: { gap: UiSpacing.xs },
  groupLabel: {
    fontSize: UiTypography.caption.fontSize,
    fontWeight: '800',
    letterSpacing: 0.85,
    lineHeight: UiTypography.caption.lineHeight,
    paddingHorizontal: 2,
  },
  groupCard: { borderRadius: UiRadii.card, borderWidth: 1, overflow: 'hidden' },
  divider: { height: 1, marginLeft: 61 },
  generatedAt: {
    fontSize: UiTypography.label.fontSize,
    lineHeight: 18,
    textAlign: 'center',
  },
  secondaryActions: { flexDirection: 'row', gap: UiSpacing.sm },
  secondaryAction: {
    alignItems: 'center',
    borderRadius: UiRadii.control,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: UiSpacing.xs,
    justifyContent: 'center',
    minHeight: UiControlHeights.button,
    paddingHorizontal: UiSpacing.md,
  },
  secondaryActionText: { fontSize: UiTypography.button.fontSize, fontWeight: '700' },
  primaryAction: {
    alignItems: 'center',
    borderRadius: UiRadii.control,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    justifyContent: 'center',
    minHeight: UiControlHeights.button,
    paddingHorizontal: UiSpacing.lg,
  },
  primaryActionText: { fontSize: UiTypography.button.fontSize, fontWeight: '700' },
});
