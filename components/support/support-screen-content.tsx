import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { ScreenShell } from '@/components/screen';
import { SupportSearchInput } from '@/components/support/support-search-input';
import {
  SupportArticleRow,
  SupportTopicCard,
} from '@/components/support/support-topic-card';
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
        alwaysBounceVertical={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        overScrollMode="never"
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
  content: { gap: 18, paddingBottom: 36, paddingHorizontal: 16, paddingTop: 18 },
  intro: { gap: 5 },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, lineHeight: 20, maxWidth: 560 },
  suggestionPanel: { borderRadius: 18, borderWidth: 1, gap: 13, padding: 13 },
  panelHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  sparkIcon: { alignItems: 'center', borderRadius: 9, height: 34, justifyContent: 'center', width: 34 },
  panelHeadingCopy: { flex: 1, gap: 7 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 0.9, lineHeight: 16 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: '700' },
  suggestionList: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  divider: { height: 1, marginLeft: 16 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  topicStack: { gap: 10 },
  resultCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  emptyCard: { alignItems: 'center', borderRadius: 16, borderWidth: 1, gap: 8, padding: 22 },
  emptyIcon: { alignItems: 'center', borderRadius: 12, height: 48, justifyContent: 'center', width: 48 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptyText: { fontSize: 14, lineHeight: 20, maxWidth: 380, textAlign: 'center' },
  emptyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 },
  smallAction: { alignItems: 'center', borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 },
  smallActionText: { fontSize: 14, fontWeight: '700' },
  contactCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  contactRow: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 68, paddingHorizontal: 14, paddingVertical: 11 },
  contactIcon: { alignItems: 'center', borderRadius: 10, height: 38, justifyContent: 'center', width: 38 },
  contactCopy: { flex: 1, gap: 2 },
  contactTitle: { fontSize: 15, fontWeight: '700' },
  contactSubtitle: { fontSize: 13, lineHeight: 18 },
  contactDivider: { height: 1, marginLeft: 64 },
  version: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
