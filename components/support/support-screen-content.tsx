import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { ScreenShell } from '@/components/screen';
import { SupportSearchInput } from '@/components/support/support-search-input';
import {
  SupportArticleRow,
  SupportTopicCard,
} from '@/components/support/support-topic-card';
import { UiControlHeights, UiRadii, UiSpacing, UiTypography } from '@/constants/theme';
import { CRM_LABELS } from '@/lib/crm/labels';
import { usePushState } from '@/lib/push/state';
import { getUser } from '@/lib/session';
import {
  SUPPORT_ARTICLES,
  SUPPORT_TOPIC_ORDER,
  type SupportArticle,
} from '@/lib/support/articles';
import {
  getContextualSuggestions,
  normalizeSupportText,
  searchSupportArticles,
} from '@/lib/support/search';
import { getRuntimeVersion } from '@/lib/support/version';
import { useAppTheme } from '@/lib/theme/theme-provider';

export function SupportScreenContent() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const user = getUser();
  const pushState = usePushState();
  const normalizedQuery = normalizeSupportText(query);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  const results = useMemo(
    () => searchSupportArticles(query),
    [query],
  );
  const suggestions = useMemo(
    () =>
      getContextualSuggestions({
        provider: user?.provider,
        hasOpenAIKey: user?.hasOpenAIKey,
        pushStatus: pushState.status,
      }),
    [pushState.status, user?.hasOpenAIKey, user?.provider],
  );

  function openArticle(article: SupportArticle) {
    router.push(`/support-article/${article.slug}` as Href);
  }

  function openContact(mode: 'support' | 'feedback') {
    router.push(`/contact-support?mode=${mode}` as Href);
  }

  const setupLabels = [
    user?.provider ? CRM_LABELS[user.provider] : 'No CRM selected',
    user?.hasOpenAIKey === false ? 'OpenAI key needed' : null,
    pushState.status === 'denied' ? 'Notifications off' : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <ScreenShell edges={['bottom']}>
      <PageHeader title="Help & Support" showBack />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>How can we help?</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Search practical answers or browse by topic. Articles are available even when you are offline.</Text>
        </View>

        <SupportSearchInput value={query} onChangeText={setQuery} />

        {!normalizedQuery ? (
          <View
            style={[
              styles.suggestionPanel,
              {
                backgroundColor: colors.infoSurface,
                borderColor: colors.infoBorder,
              },
            ]}>
            <View style={styles.panelHeading}>
              <View style={[styles.sparkIcon, { backgroundColor: colors.surface }]}>
                <MaterialIcons name="auto-awesome" size={18} color={colors.info} />
              </View>
              <View style={styles.panelHeadingCopy}>
                <Text style={[styles.eyebrow, { color: colors.infoText }]}>SUGGESTED FOR YOUR SETUP</Text>
                <View style={styles.pillRow}>
                  {setupLabels.map((label) => (
                    <View
                      key={label}
                      style={[
                        styles.pill,
                        { backgroundColor: colors.surface, borderColor: colors.infoBorder },
                      ]}>
                      <Text style={[styles.pillText, { color: colors.infoText }]}>{label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
            <View
              style={[
                styles.suggestionList,
                { backgroundColor: colors.surface, borderColor: colors.infoBorder },
              ]}>
              {suggestions.map((article, index) => (
                <View key={article.slug}>
                  {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.divider }]} /> : null}
                  <SupportArticleRow article={article} onPress={() => openArticle(article)} />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {normalizedQuery ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Search results</Text>
            {results.length > 0 ? (
              <View
                style={[
                  styles.resultCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}>
                {results.map(({ article }, index) => (
                  <View key={article.slug}>
                    {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.divider }]} /> : null}
                    <SupportArticleRow
                      article={article}
                      onPress={() => openArticle(article)}
                      showSummary
                    />
                  </View>
                ))}
              </View>
            ) : (
              <View
                accessibilityLiveRegion="polite"
                style={[
                  styles.emptyCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceMuted }]}>
                  <MaterialIcons name="search-off" size={24} color={colors.icon} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No matching articles</Text>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Try fewer words, clear the search to browse topics, or send us a message.</Text>
                <View style={styles.emptyActions}>
                  <SmallAction label="Contact support" onPress={() => openContact('support')} />
                  <SmallAction label="Send feedback" onPress={() => openContact('feedback')} />
                </View>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Browse topics</Text>
            <View style={styles.topicStack}>
              {SUPPORT_TOPIC_ORDER.map((topic) => (
                <SupportTopicCard
                  key={topic}
                  topic={topic}
                  articles={SUPPORT_ARTICLES.filter((article) => article.topic === topic)}
                  onArticlePress={openArticle}
                />
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Check your setup</Text>
          <Pressable
            accessibilityHint="Runs privacy-safe app, connection, and account checks"
            accessibilityRole="button"
            onPress={() => router.push('/support-diagnostics' as Href)}
            style={({ pressed }) => [
              styles.diagnosticsCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && { backgroundColor: colors.surfacePressed },
            ]}>
            <View style={[styles.diagnosticsIcon, { backgroundColor: colors.successSurface }]}>
              <MaterialIcons name="health-and-safety" size={23} color={colors.success} />
            </View>
            <View style={styles.diagnosticsCopy}>
              <Text style={[styles.diagnosticsTitle, { color: colors.textPrimary }]}>Run diagnostics</Text>
              <Text style={[styles.diagnosticsSubtitle, { color: colors.textSecondary }]}>Safe, read-only checks you can review before sharing</Text>
              <View style={styles.privacyLabel}>
                <MaterialIcons name="lock-outline" size={13} color={colors.success} />
                <Text style={[styles.privacyLabelText, { color: colors.success }]}>No passwords, tokens, or CRM records</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={23} color={colors.iconMuted} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Talk to us</Text>
          <View
            style={[
              styles.contactCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
            <ContactRow
              icon="support-agent"
              title="Contact support"
              subtitle="Tell us what is not working"
              onPress={() => openContact('support')}
            />
            <View style={[styles.contactDivider, { backgroundColor: colors.divider }]} />
            <ContactRow
              icon="lightbulb-outline"
              title="Send product feedback"
              subtitle="Share an idea or improvement"
              onPress={() => openContact('feedback')}
            />
          </View>
        </View>

        <Text style={[styles.version, { color: colors.textMuted }]}>AI Concierge {getRuntimeVersion()}</Text>
      </ScrollView>
    </ScreenShell>
  );
}

function SmallAction({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallAction,
        { borderColor: colors.borderStrong },
        pressed && { backgroundColor: colors.surfacePressed },
      ]}>
      <Text style={[styles.smallActionText, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

function ContactRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: 'support-agent' | 'lightbulb-outline';
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityLabel={`${title}. ${subtitle}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.contactRow, pressed && { backgroundColor: colors.surfacePressed }]}>
      <View style={[styles.contactIcon, { backgroundColor: colors.primaryMuted }]}>
        <MaterialIcons name={icon} size={21} color={colors.primary} />
      </View>
      <View style={styles.contactCopy}>
        <Text style={[styles.contactTitle, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.contactSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={colors.iconMuted} />
    </Pressable>
  );
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
    maxWidth: 560,
  },
  suggestionPanel: {
    borderRadius: UiRadii.card,
    borderWidth: 1,
    gap: UiSpacing.md,
    padding: UiSpacing.md,
  },
  panelHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: UiSpacing.sm,
  },
  sparkIcon: {
    alignItems: 'center',
    borderRadius: UiRadii.icon,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  panelHeadingCopy: { flex: 1, gap: UiSpacing.xs },
  eyebrow: {
    fontSize: UiTypography.caption.fontSize,
    fontWeight: '800',
    letterSpacing: 0.9,
    lineHeight: UiTypography.caption.lineHeight,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: UiSpacing.xs },
  pill: {
    borderRadius: UiRadii.control,
    borderWidth: 1,
    paddingHorizontal: UiSpacing.sm,
    paddingVertical: UiSpacing.xxs,
  },
  pillText: { fontSize: UiTypography.caption.fontSize, fontWeight: '700' },
  suggestionList: {
    borderRadius: UiRadii.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  divider: { height: 1, marginLeft: UiSpacing.lg },
  section: { gap: UiSpacing.sm },
  sectionTitle: {
    fontSize: UiTypography.cardHeading.fontSize,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: UiTypography.cardHeading.lineHeight,
  },
  topicStack: { gap: UiSpacing.sm },
  resultCard: { borderRadius: UiRadii.card, borderWidth: 1, overflow: 'hidden' },
  emptyCard: {
    alignItems: 'center',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    gap: UiSpacing.sm,
    padding: UiSpacing.xl,
  },
  emptyIcon: {
    alignItems: 'center',
    borderRadius: UiRadii.icon,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  emptyTitle: {
    fontSize: UiTypography.cardHeading.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.cardHeading.lineHeight,
  },
  emptyText: {
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    maxWidth: 380,
    textAlign: 'center',
  },
  emptyActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: UiSpacing.sm,
    justifyContent: 'center',
    marginTop: UiSpacing.xxs,
  },
  smallAction: {
    alignItems: 'center',
    borderRadius: UiRadii.control,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: UiControlHeights.button,
    paddingHorizontal: 14,
  },
  smallActionText: { fontSize: UiTypography.button.fontSize, fontWeight: '700' },
  diagnosticsCard: {
    alignItems: 'center',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.md,
    minHeight: 72,
    padding: UiSpacing.md,
  },
  diagnosticsIcon: {
    alignItems: 'center',
    borderRadius: UiRadii.icon,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  diagnosticsCopy: { flex: 1, gap: 2 },
  diagnosticsTitle: {
    fontSize: UiTypography.body.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.body.lineHeight,
  },
  diagnosticsSubtitle: { fontSize: 13, lineHeight: 18 },
  privacyLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: UiSpacing.xxs,
    marginTop: 3,
  },
  privacyLabelText: { fontSize: 10, fontWeight: '700', lineHeight: 14 },
  contactCard: { borderRadius: UiRadii.card, borderWidth: 1, overflow: 'hidden' },
  contactRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: UiSpacing.md,
    minHeight: 64,
    paddingHorizontal: UiSpacing.md,
    paddingVertical: UiSpacing.sm,
  },
  contactIcon: {
    alignItems: 'center',
    borderRadius: UiRadii.icon,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  contactCopy: { flex: 1, gap: 2 },
  contactTitle: { fontSize: UiTypography.body.fontSize, fontWeight: '700' },
  contactSubtitle: { fontSize: 13, lineHeight: 18 },
  contactDivider: { height: 1, marginLeft: 60 },
  version: {
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
    textAlign: 'center',
  },
});
