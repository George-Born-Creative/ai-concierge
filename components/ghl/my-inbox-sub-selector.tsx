import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/lib/theme/theme-provider';

export type MyInboxSub = 'all' | 'assigned' | 'followed';

type Props = {
  active: MyInboxSub;
  onChange: (sub: MyInboxSub) => void;
};

const SUBS: { key: MyInboxSub; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { key: 'all', label: 'All', icon: 'all-inbox' },
  { key: 'assigned', label: 'Assigned to me', icon: 'person' },
  { key: 'followed', label: 'Followed by me', icon: 'visibility' },
];

export function MyInboxSubSelector({ active, onChange }: Props) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.wrapper, { borderBottomColor: colors.border }]}>
      {SUBS.map((s) => {
        const isActive = s.key === active;
        return (
          <Pressable
            key={s.key}
            onPress={() => onChange(s.key)}
            style={[
              styles.option,
              {
                backgroundColor: isActive ? colors.primary + '15' : 'transparent',
                borderColor: isActive ? colors.primary : 'transparent',
              },
            ]}>
            <MaterialIcons
              name={s.icon}
              size={16}
              color={isActive ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.optionLabel,
                { color: isActive ? colors.primary : colors.textMuted },
                isActive && styles.optionLabelActive,
              ]}>
              {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  option: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  optionLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  optionLabelActive: {
    fontWeight: '700',
  },
});
