import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/lib/theme/theme-provider';

export type SectionKey = 'my-inbox' | 'team' | 'internal';

type Props = {
  active: SectionKey;
  onChange: (section: SectionKey) => void;
};

const TABS: { key: SectionKey; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { key: 'my-inbox', label: 'My Inbox', icon: 'inbox' },
  { key: 'team', label: 'Team Inbox', icon: 'people' },
  { key: 'internal', label: 'Internal', icon: 'forum' },
];

export function ConversationSectionTabs({ active, onChange }: Props) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.wrapper, { borderBottomColor: colors.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              style={[
                styles.tab,
                isActive && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
              ]}>
              <MaterialIcons
                name={tab.icon}
                size={18}
                color={isActive ? colors.primary : colors.textMuted}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: isActive ? colors.primary : colors.textMuted },
                  isActive && styles.tabLabelActive,
                ]}>
                {tab.label}
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
    borderBottomWidth: 1,
  },
  scroll: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 12,
  },
  tab: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  tabLabelActive: {
    fontWeight: '700',
  },
});
