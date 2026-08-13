import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useAppTheme } from '@/lib/theme/theme-provider';

type ScreenShellProps = {
  children: ReactNode;
  /**
   * Which edges to apply safe-area insets to. Defaults to the top edge only so
   * the device status bar (time / wifi / battery) is never hidden. Pass
   * `['top', 'bottom']` for full-screen content without a bottom tab bar.
   */
  edges?: readonly Edge[];
  /** Surface color. Defaults to the single app background so there is no seam. */
  backgroundColor?: string;
  style?: ViewStyle;
};

/**
 * Shared screen wrapper. Centralizes safe-area handling (via
 * react-native-safe-area-context, which — unlike react-native's SafeAreaView —
 * insets correctly on Android edge-to-edge) and the app background color.
 */
export function ScreenShell({
  children,
  edges = ['top'],
  backgroundColor,
  style,
}: ScreenShellProps) {
  const { colors } = useAppTheme();
  const resolvedBackground = backgroundColor ?? colors.background;

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.fill, { backgroundColor: resolvedBackground }, style]}>
      <View style={[styles.fill, { backgroundColor: resolvedBackground }]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
