import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { VoiceRecordingVisual } from "@/components/voice/voice-recording-visual";

export type ChatVoiceActivity = "idle" | "recording" | "sending";

type ChatVoiceWaveOverlayProps = {
  activity: ChatVoiceActivity;
};

export function ChatVoiceWaveOverlay({ activity }: ChatVoiceWaveOverlayProps) {
  const [elapsed, setElapsed] = useState(0);

  // Count up while recording; freeze the value while sending; reset on the
  // next recording. The interval only runs during "recording".
  useEffect(() => {
    if (activity !== "recording") {
      return;
    }
    setElapsed(0);
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [activity]);

  if (activity === "idle") {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <VoiceRecordingVisual seconds={elapsed} size={200} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
});
