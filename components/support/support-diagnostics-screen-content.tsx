import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PageHeader } from '@/components/page-header';
import { ScreenShell } from '@/components/screen';
import { DiagnosticRow } from '@/components/support/diagnostic-row';
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

        {loading ? (
          <LoadingState />
        ) : error ? (
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

function LoadingState() {
  const { colors } = useAppTheme();
  return (
    <View
      accessibilityLabel="Running support diagnostics"
      accessibilityLiveRegion="polite"
      style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.stateIcon, { backgroundColor: colors.primaryMuted }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
      <Text style={[styles.stateTitle, { color: colors.textPrimary }]}>Running safe checks...</Text>
      <Text style={[styles.stateText, { color: colors.textSecondary }]}>Checking this app, your connection, and stored account configuration. No third-party data is opened.</Text>
    </View>
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
    gap: 18,
    maxWidth: 720,
    paddingBottom: 44,
    paddingHorizontal: 16,
    paddingTop: 18,
    width: '100%',
  },
  intro: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  introIcon: { alignItems: 'center', borderRadius: 12, height: 46, justifyContent: 'center', width: 46 },
  introCopy: { flex: 1, gap: 5, paddingTop: 1 },
  title: { fontSize: 23, fontWeight: '700', letterSpacing: -0.5, lineHeight: 29 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  privacyPanel: { alignItems: 'flex-start', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 14 },
  privacyCopy: { flex: 1, gap: 5 },
  privacyTitle: { fontSize: 14, fontWeight: '800', lineHeight: 19 },
  privacyText: { fontSize: 12, lineHeight: 18 },
  stateCard: { alignItems: 'center', borderRadius: 17, borderWidth: 1, gap: 8, paddingHorizontal: 22, paddingVertical: 30 },
  stateIcon: { alignItems: 'center', borderRadius: 14, height: 50, justifyContent: 'center', marginBottom: 2, width: 50 },
  stateTitle: { fontSize: 17, fontWeight: '700', lineHeight: 22, textAlign: 'center' },
  stateText: { fontSize: 14, lineHeight: 20, maxWidth: 420, textAlign: 'center' },
  retryButton: { alignItems: 'center', borderRadius: 11, borderWidth: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 5, minHeight: 45, paddingHorizontal: 16 },
  retryText: { fontSize: 14, fontWeight: '700' },
  summaryBand: { alignItems: 'stretch', borderRadius: 15, borderWidth: 1, flexDirection: 'row', minHeight: 74, overflow: 'hidden' },
  summaryItem: { alignItems: 'center', flex: 1, gap: 1, justifyContent: 'center', paddingHorizontal: 5, paddingVertical: 10 },
  summaryCount: { fontSize: 18, fontWeight: '800', lineHeight: 22 },
  summaryLabel: { fontSize: 10, fontWeight: '700', lineHeight: 14 },
  summaryDivider: { alignSelf: 'stretch', width: 1 },
  groupStack: { gap: 17 },
  group: { gap: 7 },
  groupLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.85, lineHeight: 16, paddingHorizontal: 2 },
  groupCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  divider: { height: 1, marginLeft: 61 },
  generatedAt: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  secondaryActions: { flexDirection: 'row', gap: 9 },
  secondaryAction: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 48, paddingHorizontal: 12 },
  secondaryActionText: { fontSize: 14, fontWeight: '700' },
  primaryAction: { alignItems: 'center', borderRadius: 13, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 52, paddingHorizontal: 18 },
  primaryActionText: { fontSize: 15, fontWeight: '700' },
});
