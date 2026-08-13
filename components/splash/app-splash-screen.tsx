import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/lib/theme/theme-provider';

// Visible JS splash. Uses the same four-dot logo as the home/auth screens so
// the brand is consistent end-to-end. Stays mounted (covering the whole tree)
// until the root layout receives the bootstrap-ready signal.
export function AppSplashScreen() {
  const { colors } = useAppTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

  return (
    <View
      style={[styles.screen, { backgroundColor: colors.background }]}
      pointerEvents="none">
      <Animated.View style={[styles.logoMark, { transform: [{ scale }] }]}>
        <View style={[styles.logoDot, styles.blueDot]} />
        <View style={[styles.logoDot, styles.redDot]} />
        <View style={[styles.logoDot, styles.yellowDot]} />
        <View style={[styles.logoDot, styles.greenDot]} />
      </Animated.View>
      <Text style={[styles.name, { color: colors.textPrimary }]}>AI-Concierge</Text>
    </View>
  );
}

// Dot sizes/positions mirror components/home/home-screen-content.tsx exactly.
const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  logoMark: {
    alignItems: 'center',
    height: 96,
    justifyContent: 'center',
    width: 96,
  },
  logoDot: {
    borderRadius: 20,
    position: 'absolute',
  },
  blueDot: {
    backgroundColor: '#4285F4',
    height: 56,
    left: 8,
    width: 56,
  },
  redDot: {
    backgroundColor: '#EA4335',
    height: 36,
    right: 12,
    top: 12,
    width: 36,
  },
  yellowDot: {
    backgroundColor: '#FBBC04',
    bottom: 12,
    height: 32,
    right: 18,
    width: 32,
  },
  greenDot: {
    backgroundColor: '#34A853',
    bottom: 20,
    height: 24,
    left: 24,
    width: 24,
  },
  name: {
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: -0.8,
    marginTop: 24,
  },
});
