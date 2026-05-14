import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Audio } from 'expo-av';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

type AIConciergeVoiceRecorderProps = {
  apiEndpoint?: string;
  disabled?: boolean;
  onAudioRecorded?: (uri: string) => Promise<void> | void;
  onError?: (message: string) => void;
  onRecordingChange?: (isRecording: boolean) => void;
};

const waveHeights = [22, 42, 30, 58, 36, 70, 44, 62, 34, 48, 26];

export function AIConciergeVoiceRecorder({
  apiEndpoint,
  disabled = false,
  onAudioRecorded,
  onError,
  onRecordingChange,
}: AIConciergeVoiceRecorderProps) {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const hasStoppedRef = useRef(false);
  const isStartingRef = useRef(false);
  const pendingStopRef = useRef(false);
  const glowAnim = useRef(new Animated.Value(0)).current;
  const waveAnim = useRef(new Animated.Value(0)).current;
  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);

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
  }, [glowAnim, isRecording, waveAnim]);

  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => undefined);
      }
    };
  }, []);

  async function startRecording() {
    if (disabled || isRecording || isSending) {
      return;
    }

    hasStoppedRef.current = false;
    isStartingRef.current = true;
    pendingStopRef.current = false;

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

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
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
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = recording.getURI();
      recordingRef.current = null;

      if (!uri) {
        notifyError('I could not save the voice message. Please try again.');
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
    <View style={[styles.shell, isRecording && styles.recordingShell]}>
      {isRecording || isSending ? (
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

      <View style={styles.micStage}>
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
        <Pressable
          accessibilityLabel="Hold to record voice command"
          disabled={disabled || isSending}
          onPressIn={startRecording}
          onPressOut={stopRecording}
          style={({ pressed }) => [
            styles.micButton,
            isRecording && styles.recordingMicButton,
            (disabled || isSending) && styles.disabledButton,
            pressed && !disabled && !isSending && styles.pressedButton,
          ]}>
          <MaterialIcons name="mic" size={40} color="#FFFFFF" />
        </Pressable>
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
