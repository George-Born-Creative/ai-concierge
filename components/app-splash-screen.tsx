import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

export function AppSplashScreen() {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    pulseLoop.start();

    return () => pulseLoop.stop();
  }, [pulseAnim]);

  const logoScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });

  return (
    <View style={styles.screen}>
      <Animated.View style={[styles.logoMark, { transform: [{ scale: logoScale }] }]}>
        <View style={[styles.logoDot, styles.blueDot]} />
        <View style={[styles.logoDot, styles.redDot]} />
        <View style={[styles.logoDot, styles.yellowDot]} />
        <View style={[styles.logoDot, styles.greenDot]} />
      </Animated.View>

      <Text style={styles.name}>AI-Concierge</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    backgroundColor: '#F8FAFF',
    flex: 1,
    justifyContent: 'center',
  },
  logoMark: {
    alignItems: 'center',
    height: 118,
    justifyContent: 'center',
    width: 118,
  },
  logoDot: {
    borderRadius: 24,
    position: 'absolute',
  },
  blueDot: {
    backgroundColor: '#4285F4',
    height: 68,
    left: 10,
    width: 68,
  },
  redDot: {
    backgroundColor: '#EA4335',
    height: 42,
    right: 14,
    top: 14,
    width: 42,
  },
  yellowDot: {
    backgroundColor: '#FBBC04',
    bottom: 16,
    height: 38,
    right: 20,
    width: 38,
  },
  greenDot: {
    backgroundColor: '#34A853',
    bottom: 24,
    height: 28,
    left: 30,
    width: 28,
  },
  name: {
    color: '#202124',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.7,
    marginTop: 22,
  },
});
