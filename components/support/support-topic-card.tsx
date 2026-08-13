import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { UiRadii, UiSpacing, UiTypography } from '@/constants/theme';
import {
  SUPPORT_TOPIC_META,
  type SupportArticle,
  type SupportTopic,
} from '@/lib/support/articles';
import { useAppTheme } from '@/lib/theme/theme-provider';

type SupportTopicCardProps = {
  topic: SupportTopic;
  articles: readonly SupportArticle[];
  onArticlePress: (article: SupportArticle) => void;
};

export function SupportTopicCard({
  topic,
  articles,
  onArticlePress,
}: SupportTopicCardProps) {
  const { colors } = useAppTheme();
  const meta = SUPPORT_TOPIC_META[topic];

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}>
      <View style={styles.headingRow}>
        <View style={[styles.iconBox, { backgroundColor: colors.primaryMuted }]}>
          <MaterialIcons name={meta.icon} size={20} color={colors.primary} />
        </View>
        <Text style={[styles.heading, { color: colors.textPrimary }]}>
          {meta.label}
        </Text>
      </View>
      <View>
        {articles.map((article, index) => (
          <View key={article.slug}>
            {index > 0 ? (
              <View style={[styles.divider, { backgroundColor: colors.divider }]} />
            ) : null}
            <SupportArticleRow article={article} onPress={() => onArticlePress(article)} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function SupportArticleRow({
  article,
  onPress,
  showSummary = false,
}: {
  article: SupportArticle;
  onPress: () => void;
  showSummary?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityLabel={`${article.title}. ${article.summary}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.articleRow,
        pressed && { backgroundColor: colors.surfacePressed },
      ]}>
      <View style={styles.articleCopy}>
        <Text style={[styles.articleTitle, { color: colors.textPrimary }]}>
          {article.title}
        </Text>
        {showSummary ? (
          <Text style={[styles.summary, { color: colors.textSecondary }]}>
            {article.summary}
          </Text>
        ) : null}
      </View>
      <MaterialIcons name="chevron-right" size={22} color={colors.iconMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: UiRadii.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  headingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: UiSpacing.sm,
    paddingBottom: UiSpacing.xxs,
    paddingHorizontal: UiSpacing.md,
    paddingTop: UiSpacing.md,
  },
  iconBox: {
    alignItems: 'center',
    borderRadius: UiRadii.icon,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  heading: {
    flex: 1,
    fontSize: UiTypography.cardHeading.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.cardHeading.lineHeight,
  },
  divider: {
    height: 1,
    marginLeft: 56,
  },
  articleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: UiSpacing.md,
    paddingVertical: UiSpacing.sm,
  },
  articleCopy: {
    flex: 1,
    gap: UiSpacing.xxs,
    paddingLeft: 40,
  },
  articleTitle: {
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  summary: {
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
  },
});
