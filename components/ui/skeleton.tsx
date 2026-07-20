import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/lib/theme/theme-provider';

type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle | ViewStyle[];
};

/**
 * Lightweight shimmer placeholder. Uses Animated (no native driver hack)
 * pulsing opacity — cheap, no extra libs, looks the same on iOS / Android / web.
 */
export function Skeleton({ width = '100%', height = 14, radius = 8, style }: SkeletonProps) {
  const { colors } = useAppTheme();
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.base,
        {
          width,
          height,
          borderRadius: radius,
          opacity,
          backgroundColor: colors.skeletonBase,
        },
        style as ViewStyle,
      ]}
    />
  );
}

/**
 * Multiple shimmer lines stacked vertically — handy for paragraph placeholders.
 * Last line is shorter to mimic real wrapped text.
 */
export function SkeletonLines({
  lines = 3,
  lineHeight = 12,
  gap = 8,
  lastLineWidth = '60%',
}: {
  lines?: number;
  lineHeight?: number;
  gap?: number;
  lastLineWidth?: number | `${number}%`;
}) {
  const items = useMemo(() => Array.from({ length: lines }, (_, i) => i), [lines]);
  return (
    <View style={{ gap }}>
      {items.map((i) => (
        <Skeleton
          key={i}
          height={lineHeight}
          width={i === items.length - 1 ? lastLineWidth : '100%'}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
