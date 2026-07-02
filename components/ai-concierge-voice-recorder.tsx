import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Audio } from 'expo-av';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

type VoiceActivity = 'idle' | 'recording' | 'sending';

type AIConciergeVoiceRecorderProps = {
  apiEndpoint?: string;
  disabled?: boolean;
  onAudioRecorded?: (uri: string) => Promise<void> | void;
  onError?: (message: string) => void;
  onRecordingChange?: (isRecording: boolean) => void;
  onActivityChange?: (activity: VoiceActivity) => void;
  variant?: 'tab' | 'composer';
};

const waveHeights = [22, 42, 30, 58, 36, 70, 44, 62, 34, 48, 26];

// Silence gating. A recording is rejected (never transcribed) when it ends
// almost instantly OR its loudness never rises above the silence floor.
// Whisper hallucinates phantom phrases ("you", "thank you", "bye") on silent
// or noise-only clips, so we stop those before they ever hit the network.
// Metering is device-dependent, so the threshold is intentionally
// conservative — it only blocks clips that are clearly silent.
const MIN_RECORDING_MS = 400;
const SILENCE_PEAK_DBFS = -50;

export function AIConciergeVoiceRecorder({
  apiEndpoint,
  disabled = false,
  onAudioRecorded,
  onError,
  onRecordingChange,
  onActivityChange,
  variant = 'tab',
}: AIConciergeVoiceRecorderProps) {
  const isComposer = variant === 'composer';
  const recordingRef = useRef<Audio.Recording | null>(null);
  const hasStoppedRef = useRef(false);
  const isStartingRef = useRef(false);
  const pendingStopRef = useRef(false);
  // Loudness/duration tracking for silence gating (see MIN_RECORDING_MS /
  // SILENCE_PEAK_DBFS). Reset at the start of every recording.
  const maxMeteringRef = useRef(-Infinity);
  const meteringSamplesRef = useRef(0);
  const lastDurationRef = useRef(0);
  const glowAnim = useRef(new Animated.Value(0)).current;
  const waveAnim = useRef(new Animated.Value(0)).current;
  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const glowScale = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.42],
  });
  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.38, 0],
  });

  useEffect(() => {
    onRecordingChange?.(isRecording);
  }, [isRecording, onRecordingChange]);

  useEffect(() => {
    const activity: VoiceActivity = isSending ? 'sending' : isRecording ? 'recording' : 'idle';
    onActivityChange?.(activity);
  }, [isRecording, isSending, onActivityChange]);

  useEffect(() => {
    if (isComposer) {
      return;
    }

    if (!isRecording) {
      glowAnim.stopAnimation();
      waveAnim.stopAnimation();
      glowAnim.setValue(0);
      waveAnim.setValue(0);
      return;
    }

    const glowLoop = Animated.loop(
      Animated.timing(glowAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    const waveLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(waveAnim, {
          toValue: 1,
          duration: 680,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(waveAnim, {
          toValue: 0,
          duration: 680,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    );

    glowLoop.start();
    waveLoop.start();

    return () => {
      glowLoop.stop();
      waveLoop.stop();
    };
  }, [glowAnim, isComposer, isRecording, waveAnim]);

  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => undefined);
      }
    };
  }, []);

  // Sampled on every progress tick (and once more right before stop). Tracks
  // the loudest moment + latest duration so we can tell speech from silence.
  function handleRecordingStatus(status: Audio.RecordingStatus) {
    if (typeof status.durationMillis === 'number' && status.durationMillis > 0) {
      lastDurationRef.current = status.durationMillis;
    }
    if (typeof status.metering === 'number' && Number.isFinite(status.metering)) {
      meteringSamplesRef.current += 1;
      if (status.metering > maxMeteringRef.current) {
        maxMeteringRef.current = status.metering;
      }
    }
  }

  // True when the clip almost certainly contains no spoken command.
  function isProbablySilent(): boolean {
    const durationMs = lastDurationRef.current;
    const hadMetering = meteringSamplesRef.current > 0;
    const peakDb = maxMeteringRef.current;

    if (durationMs > 0 && durationMs < MIN_RECORDING_MS) {
      return true;
    }
    if (hadMetering && peakDb < SILENCE_PEAK_DBFS) {
      return true;
    }
    return false;
  }

  async function startRecording() {
    if (disabled || isRecording || isSending) {
      return;
    }

    hasStoppedRef.current = false;
    isStartingRef.current = true;
    pendingStopRef.current = false;
    maxMeteringRef.current = -Infinity;
    meteringSamplesRef.current = 0;
    lastDurationRef.current = 0;

    try {
      const permission = await Audio.requestPermissionsAsync();

      if (!permission.granted) {
        notifyError('Please allow microphone access to record a voice command.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recordingOptions: Audio.RecordingOptions = {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      };

      const { recording } = await Audio.Recording.createAsync(
        recordingOptions,
        handleRecordingStatus,
        100,
      );

      recordingRef.current = recording;
      setIsRecording(true);

      if (pendingStopRef.current) {
        await finishRecording(recording);
      }
    } catch {
      recordingRef.current = null;
      setIsRecording(false);
      notifyError('I could not start recording. Please try again.');
    } finally {
      isStartingRef.current = false;
    }
  }

  async function stopRecording() {
    if (isStartingRef.current) {
      pendingStopRef.current = true;
      return;
    }

    if (!isRecording || hasStoppedRef.current) {
      return;
    }

    const recording = recordingRef.current;

    if (!recording) {
      setIsRecording(false);
      notifyError('I could not find an active recording. Please try again.');
      return;
    }

    await finishRecording(recording);
  }

  async function finishRecording(recording: Audio.Recording) {
    hasStoppedRef.current = true;
    setIsRecording(false);
    setIsSending(true);

    try {
      // Grab a final duration + metering reading before unloading so ultra-
      // short clips (whose progress tick never fired) are still measured.
      try {
        const finalStatus = await recording.getStatusAsync();
        handleRecordingStatus(finalStatus);
      } catch {
        // Status unavailable — fall back to whatever was sampled live.
      }

      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = recording.getURI();
      recordingRef.current = null;

      if (!uri) {
        notifyError('I could not save the voice message. Please try again.');
        return;
      }

      if (isProbablySilent()) {
        notifyError('Voice not detected. Please try again and speak clearly into the microphone.');
        return;
      }

      await sendAudio(uri);
    } catch {
      notifyError('I could not send the voice message. Please try again.');
    } finally {
      recordingRef.current = null;
      setIsSending(false);
    }
  }

  async function sendAudio(uri: string) {
    if (apiEndpoint) {
      const formData = new FormData();
      formData.append(
        'audio',
        {
          uri,
          name: 'ai-concierge-command.m4a',
          type: 'audio/m4a',
        } as unknown as Blob
      );

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Audio upload failed');
      }
    }

    await onAudioRecorded?.(uri);
  }

  function notifyError(message: string) {
    onError?.(message);
  }

  return (
    <View
      style={[
        styles.shell,
        isComposer && styles.composerShell,
        isRecording && !isComposer && styles.recordingShell,
      ]}>
      {(isRecording || isSending) && !isComposer ? (
        <View style={styles.recordingPanel}>
          <View style={styles.headerRow}>
            <View style={[styles.statusDot, isRecording && styles.recordingStatusDot]} />
            <Text style={styles.statusText}>{isSending ? 'Sending audio' : 'Listening now'}</Text>
          </View>

          <View style={styles.waveform} accessibilityElementsHidden>
            {waveHeights.map((height, index) => {
              const animatedHeight = waveAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [height * 0.45, height],
              });

              return (
                <Animated.View
                  key={`${height}-${index}`}
                  style={[
                    styles.waveBar,
                    {
                      height: isRecording ? animatedHeight : height * 0.34,
                      opacity: isRecording ? 1 : 0.35,
                    },
                  ]}
                />
              );
            })}
          </View>

          <Text style={styles.helperText}>
            {isSending ? 'Preparing your voice command...' : 'Release when you are done speaking'}
          </Text>
        </View>
      ) : null}

      <View style={[styles.micStage, isComposer && styles.composerMicStage]}>
        {!isComposer ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.glowRing,
              {
                opacity: isRecording ? glowOpacity : 0,
                transform: [{ scale: glowScale }],
              },
            ]}
          />
        ) : null}
        {/*
          Hold-to-record uses the raw touch-responder system rather than
          Pressable. Pressable cancels the press on the slightest finger
          movement (Android treats it as a scroll), so `onPressOut` often
          never fires and the recording either won't stop or won't start.
          Claiming the responder + refusing to release it on move + handling
          termination makes press-and-hold reliable: press = start, release
          (or interruption) = stop.
        */}
        <View
          accessibilityRole="button"
          accessibilityLabel="Hold to record voice command"
          accessibilityState={{ disabled: disabled || isSending }}
          onStartShouldSetResponder={() => !disabled && !isSending}
          onMoveShouldSetResponder={() => false}
          onResponderTerminationRequest={() => false}
          onResponderGrant={() => {
            setIsPressed(true);
            void startRecording();
          }}
          onResponderRelease={() => {
            setIsPressed(false);
            void stopRecording();
          }}
          onResponderTerminate={() => {
            setIsPressed(false);
            void stopRecording();
          }}
          style={[
            styles.micButton,
            isComposer && styles.composerMicButton,
            isRecording && styles.recordingMicButton,
            (disabled || isSending) && styles.disabledButton,
            isPressed && !disabled && !isSending && styles.pressedButton,
          ]}>
          {isComposer && isSending ? (
            <MaterialIcons name="hourglass-top" size={22} color="#FFFFFF" />
          ) : (
            <MaterialIcons name="mic" size={isComposer ? 25 : 40} color="#FFFFFF" />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    width: 120,
  },
  composerShell: {
    width: 48,
  },
  recordingShell: {
    transform: [{ translateY: -4 }],
  },
  recordingPanel: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D2E3FC',
    borderRadius: 16,
    borderWidth: 1,
    elevation: 14,
    minWidth: 294,
    paddingHorizontal: 22,
    paddingVertical: 18,
    position: 'absolute',
    bottom: 104,
    shadowColor: '#1A73E8',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.2,
    shadowRadius: 36,
  },
  headerRow: {
    alignItems: 'center',
    backgroundColor: '#F1F6FF',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  statusDot: {
    backgroundColor: '#34A853',
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  recordingStatusDot: {
    backgroundColor: '#EA4335',
  },
  statusText: {
    color: '#174EA6',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  micStage: {
    alignItems: 'center',
    height: 106,
    justifyContent: 'center',
    width: 106,
  },
  composerMicStage: {
    height: 48,
    width: 48,
  },
  glowRing: {
    backgroundColor: '#1A73E8',
    borderRadius: 68,
    height: 112,
    position: 'absolute',
    width: 112,
  },
  micButton: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: 46,
    elevation: 10,
    height: 92,
    justifyContent: 'center',
    shadowColor: '#1A73E8',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.32,
    shadowRadius: 26,
    width: 92,
  },
  composerMicButton: {
    borderRadius: 14,
    elevation: 0,
    height: 48,
    shadowOpacity: 0,
    width: 48,
  },
  recordingMicButton: {
    backgroundColor: '#1558D6',
    shadowOpacity: 0.5,
  },
  disabledButton: {
    opacity: 0.55,
  },
  pressedButton: {
    transform: [{ scale: 0.96 }],
  },
  waveform: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    height: 86,
    justifyContent: 'center',
    marginTop: 16,
  },
  waveBar: {
    backgroundColor: '#1A73E8',
    borderRadius: 999,
    width: 7,
  },
  helperText: {
    color: '#5F6368',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
});
