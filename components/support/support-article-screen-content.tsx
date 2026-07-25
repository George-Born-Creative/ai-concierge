import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { ScreenShell } from '@/components/screen';
import type { SupportRequestCategory } from '@/lib/api/types';
import {
  getSupportArticle,
  SUPPORT_TOPIC_META,
  type SupportArticleAction,
} from '@/lib/support/articles';
import { useAppTheme } from '@/lib/theme/theme-provider';

export function SupportArticleScreenContent({ slug }: { slug: string }) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const article = getSupportArticle(slug);

  function openContact(category: SupportRequestCategory, subject?: string) {
    const query = new URLSearchParams({
      mode: 'support',
      category,
      subject: subject ?? '',
    });
    router.push(`/contact-support?${query.toString()}` as Href);
  }

  function runAction(action: SupportArticleAction) {
    switch (action.type) {
      case 'settings':
        router.push('/settings' as Href);
        return;
      case 'openai-key':
        router.push({
          pathname: '/openai-key',
          params: { from: 'settings', replace: '1' },
        });
        return;
      case 'reminders':
        router.push('/reminders' as Href);
        return;
      case 'diagnostics':
        router.push('/support-diagnostics' as Href);
        return;
      case 'contact-support':
        openContact(action.category);
        return;
    }
  }

  if (!article) {
    return (
      <ScreenShell edges={['bottom']}>
        <PageHeader title="Help article" showBack />
        <View style={styles.notFoundWrap}>
          <View style={[styles.notFoundIcon, { backgroundColor: colors.surfaceMuted }]}>
            <MaterialIcons name="article" size={28} color={colors.icon} />
          </View>
          <Text style={[styles.notFoundTitle, { color: colors.textPrimary }]}>Article not found</Text>
          <Text style={[styles.notFoundText, { color: colors.textSecondary }]}>This help link may be out of date. Return to the Support Center to find the latest guidance.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/support' as Href)}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: pressed ? colors.primaryPressed : colors.primary },
            ]}>
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Back to Support Center</Text>
          </Pressable>
        </View>
      </ScreenShell>
    );
  }

  const topic = SUPPORT_TOPIC_META[article.topic];

  return (
    <ScreenShell edges={['bottom']}>
      <PageHeader title="Help article" showBack />
      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={styles.content}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}>
        <View style={styles.articleHeader}>
          <View style={styles.eyebrowRow}>
            <MaterialIcons name={topic.icon} size={16} color={colors.primary} />
            <Text style={[styles.eyebrow, { color: colors.primary }]}>{topic.label.toUpperCase()}</Text>
          </View>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>{article.title}</Text>
          <Text style={[styles.summary, { color: colors.textSecondary }]}>{article.summary}</Text>
        </View>

        <View style={styles.steps}>
          {article.steps.map((step, index) => (
            <View
              key={step.title}
              style={[
                styles.stepCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}>
              <View
                accessibilityLabel={`Step ${index + 1}`}
                style={[styles.stepNumber, { backgroundColor: colors.primaryMuted }]}>
                <Text style={[styles.stepNumberText, { color: colors.primary }]}>{index + 1}</Text>
              </View>
              <View style={styles.stepCopy}>
                <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>{step.title}</Text>
                <Text style={[styles.stepBody, { color: colors.textSecondary }]}>{step.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {article.actions?.length ? (
          <View style={styles.actionStack}>
            {article.actions.map((action) => (
              <Pressable
                accessibilityRole="button"
                key={`${action.type}-${action.label}`}
                onPress={() => runAction(action)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: colors.borderStrong },
                  pressed && { backgroundColor: colors.surfacePressed },
                ]}>
                <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>{action.label}</Text>
                <MaterialIcons name="arrow-forward" size={18} color={colors.primary} />
              </Pressable>
            ))}
          </View>
        ) : null}

        <View
          style={[
            styles.escalation,
            { backgroundColor: colors.infoSurface, borderColor: colors.infoBorder },
          ]}>
          <View style={[styles.escalationIcon, { backgroundColor: colors.surface }]}>
            <MaterialIcons name="support-agent" size={22} color={colors.info} />
          </View>
          <View style={styles.escalationCopy}>
            <Text style={[styles.escalationTitle, { color: colors.infoText }]}>Still not working?</Text>
            <Text style={[styles.escalationBody, { color: colors.infoText }]}>Send us the details. We will preselect the right support category for this article.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => openContact(article.escalationCategory, article.title)}
              style={({ pressed }) => [
                styles.escalationButton,
                { backgroundColor: pressed ? colors.primaryPressed : colors.primary },
              ]}>
              <Text style={[styles.escalationButtonText, { color: colors.onPrimary }]}>Contact support</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20, paddingBottom: 40, paddingHorizontal: 16, paddingTop: 22 },
  articleHeader: { gap: 9, maxWidth: 680 },
  eyebrowRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: { fontSize: 25, fontWeight: '700', letterSpacing: -0.6, lineHeight: 32 },
  summary: { fontSize: 15, lineHeight: 22 },
  steps: { gap: 10 },
  stepCard: { alignItems: 'flex-start', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 13, padding: 15 },
  stepNumber: { alignItems: 'center', borderRadius: 10, height: 34, justifyContent: 'center', width: 34 },
  stepNumberText: { fontSize: 15, fontWeight: '800' },
  stepCopy: { flex: 1, gap: 4, paddingTop: 1 },
  stepTitle: { fontSize: 16, fontWeight: '700', lineHeight: 21 },
  stepBody: { fontSize: 14, lineHeight: 21 },
  actionStack: { gap: 8 },
  secondaryButton: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 48, paddingHorizontal: 16 },
  secondaryButtonText: { fontSize: 15, fontWeight: '700' },
  escalation: { alignItems: 'flex-start', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 15 },
  escalationIcon: { alignItems: 'center', borderRadius: 10, height: 40, justifyContent: 'center', width: 40 },
  escalationCopy: { flex: 1, gap: 6 },
  escalationTitle: { fontSize: 17, fontWeight: '700' },
  escalationBody: { fontSize: 14, lineHeight: 20 },
  escalationButton: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 10, justifyContent: 'center', marginTop: 5, minHeight: 44, paddingHorizontal: 16 },
  escalationButtonText: { fontSize: 14, fontWeight: '700' },
  notFoundWrap: { alignItems: 'center', flex: 1, gap: 10, justifyContent: 'center', padding: 24 },
  notFoundIcon: { alignItems: 'center', borderRadius: 15, height: 58, justifyContent: 'center', width: 58 },
  notFoundTitle: { fontSize: 22, fontWeight: '700', marginTop: 4 },
  notFoundText: { fontSize: 14, lineHeight: 21, maxWidth: 420, textAlign: 'center' },
  primaryButton: { alignItems: 'center', borderRadius: 12, justifyContent: 'center', marginTop: 8, minHeight: 48, paddingHorizontal: 20 },
  primaryButtonText: { fontSize: 15, fontWeight: '700' },
});
