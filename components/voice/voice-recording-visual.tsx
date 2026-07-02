import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { requireOptionalNativeModule } from "expo-modules-core";
import { StyleSheet, Text, View } from "react-native";

import recorderAnimation from "@/assets/animations/recorder-animation.gif";

// expo-linear-gradient is a native module. If the currently installed build
// doesn't include it yet, fall back to a solid white circle instead of
// crashing (the gradient shows up after the next native rebuild).
const linearGradientAvailable =
  requireOptionalNativeModule("ExpoLinearGradient") != null;

// Soft white gradient (top-left white -> light blue-white).
const WHITE_GRADIENT = ["#FFFFFF", "#EAF0FF"] as const;

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

type VoiceRecordingVisualProps = {
  seconds: number;
  size?: number;
};

export function VoiceRecordingVisual({
  seconds,
  size = 190,
}: VoiceRecordingVisualProps) {
  return (
    <View style={styles.wrap} accessibilityElementsHidden>
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        {linearGradientAvailable ? (
          <LinearGradient
            colors={WHITE_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.fallbackBg]} />
        )}
        <Image
          source={recorderAnimation}
          style={{ width: size, height: size }}
          contentFit="contain"
        />
      </View>
      <View style={styles.timerPill}>
        <Text style={styles.timerText}>{formatDuration(seconds)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
  },
  circle: {
    alignItems: "center",
    borderColor: "#E6ECFF",
    borderWidth: 1,
    elevation: 8,
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#1A73E8",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
  },
  fallbackBg: {
    backgroundColor: "#FFFFFF",
  },
  timerPill: {
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    borderRadius: 999,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  timerText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
    letterSpacing: 0.5,
  },
});
