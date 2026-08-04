import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/lib/theme/theme-provider';
import type { SectionKey } from './conversation-section-tabs';

export type FilterKey = 'all' | 'unread' | 'starred';

type Props = {
  active: FilterKey;
  onChange: (filter: FilterKey) => void;
  /** Internal Chat only shows All / Unread. */
  section: SectionKey;
};

const BASE_FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'starred', label: 'Starred' },
];

export function ConversationFilterChips({ active, onChange, section }: Props) {
  const { colors } = useAppTheme();

  // Internal Chat only supports all / unread.
  const filters =
    section === 'internal'
      ? BASE_FILTERS.filter((f) => f.key !== 'starred')
      : BASE_FILTERS;

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>
        {filters.map((f) => {
          const isActive = f.key === active;
          return (
            <Pressable
              key={f.key}
              onPress={() => onChange(f.key)}
              style={[
                styles.chip,
                {
                  backgroundColor: isActive ? colors.primary : colors.surface,
                  borderColor: isActive ? colors.primary : colors.border,
                },
              ]}>
              <Text
                style={[
                  styles.chipLabel,
                  { color: isActive ? '#FFFFFF' : colors.textMuted },
                ]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingVertical: 8,
  },
  scroll: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
