import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  headingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 3,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  iconBox: {
    alignItems: 'center',
    borderRadius: 9,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  heading: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginLeft: 58,
  },
  articleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  articleCopy: {
    flex: 1,
    gap: 3,
    paddingLeft: 44,
  },
  articleTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  summary: {
    fontSize: 13,
    lineHeight: 18,
  },
});
