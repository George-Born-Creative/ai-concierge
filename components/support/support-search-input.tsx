import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useAppTheme } from '@/lib/theme/theme-provider';

type SupportSearchInputProps = {
  value: string;
  onChangeText: (value: string) => void;
};

export function SupportSearchInput({
  value,
  onChangeText,
}: SupportSearchInputProps) {
  const { colors, resolvedTheme } = useAppTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.inputBackground,
          borderColor: colors.inputBorder,
        },
      ]}>
      <MaterialIcons name="search" size={22} color={colors.icon} />
      <TextInput
        accessibilityLabel="Search help articles"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="never"
        keyboardAppearance={resolvedTheme}
        onChangeText={onChangeText}
        placeholder="Search help articles"
        placeholderTextColor={colors.placeholder}
        returnKeyType="search"
        selectionColor={colors.selection}
        style={[styles.input, { color: colors.textPrimary }]}
        value={value}
      />
      {value ? (
        <Pressable
          accessibilityLabel="Clear help search"
          accessibilityRole="button"
          hitSlop={4}
          onPress={() => onChangeText('')}
          style={({ pressed }) => [
            styles.clearButton,
            pressed && { backgroundColor: colors.surfacePressed },
          ]}>
          <MaterialIcons name="close" size={20} color={colors.icon} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 52,
    paddingLeft: 14,
  },
  input: {
    flex: 1,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  clearButton: {
    alignItems: 'center',
    borderRadius: 10,
    height: 44,
    justifyContent: 'center',
    marginRight: 3,
    width: 44,
  },
});
