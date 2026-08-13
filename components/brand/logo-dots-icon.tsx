import { StyleSheet, View, type ViewStyle } from 'react-native';

// The AI-Concierge four-dot brand mark, rendered dependency-free with plain
// Views so it scales crisply at any size without react-native-svg. Geometry
// mirrors assets/images/logo-dots.svg on a 64-unit canvas:
//   blue   c(24,32) r19   red    c(44,20) r12
//   yellow c(41,45) r11   green  c(24,42) r8
type Dot = { color: string; cx: number; cy: number; r: number };

const BASE = 64;
const DOTS: Dot[] = [
  { color: '#4285F4', cx: 24, cy: 32, r: 19 },
  { color: '#EA4335', cx: 44, cy: 20, r: 12 },
  { color: '#FBBC04', cx: 41, cy: 45, r: 11 },
  { color: '#34A853', cx: 24, cy: 42, r: 8 },
];

type LogoDotsIconProps = {
  size?: number;
  style?: ViewStyle;
};

export function LogoDotsIcon({ size = 64, style }: LogoDotsIconProps) {
  const scale = size / BASE;
  return (
    <View
      style={[{ width: size, height: size }, style]}
      accessibilityRole="image"
      accessibilityLabel="AI-Concierge logo">
      {DOTS.map((dot) => {
        const diameter = dot.r * 2 * scale;
        return (
          <View
            key={dot.color}
            style={[
              styles.dot,
              {
                backgroundColor: dot.color,
                width: diameter,
                height: diameter,
                borderRadius: diameter / 2,
                left: (dot.cx - dot.r) * scale,
                top: (dot.cy - dot.r) * scale,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
  },
});
