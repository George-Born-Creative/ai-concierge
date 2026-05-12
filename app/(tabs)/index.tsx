import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function AssistantHomeScreen() {
  const router = useRouter();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  async function handleVoicePress() {
    if (isBusy) {
      return;
    }

    if (isRecording) {
      await stopRecordingAndOpenChat();
      return;
    }

    await startRecording();
  }

  async function startRecording() {
    setIsBusy(true);

    try {
      const permission = await requestRecordingPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Microphone permission', 'Please allow microphone access to record a voice command.');
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
    } catch {
      Alert.alert('Recording failed', 'I could not start recording. Please try again.');
    } finally {
      setIsBusy(false);
    }
  }

  async function stopRecordingAndOpenChat() {
    setIsBusy(true);

    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });

      if (!recorder.uri) {
        Alert.alert('Recording failed', 'I could not save the voice message. Please try again.');
        return;
      }

      setIsRecording(false);
      router.push({
        pathname: '/chat',
        params: {
          source: 'voice',
          voiceUri: recorder.uri,
        },
      });
    } catch {
      Alert.alert('Recording failed', 'I could not send the voice message. Please try again.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.logoMark}>
          <View style={[styles.logoDot, styles.blueDot]} />
          <View style={[styles.logoDot, styles.redDot]} />
          <View style={[styles.logoDot, styles.yellowDot]} />
          <View style={[styles.logoDot, styles.greenDot]} />
        </View>

        <Pressable
          style={[styles.voiceButton, isRecording && styles.recordingButton]}
          onPress={handleVoicePress}
          disabled={isBusy}>
          <MaterialIcons name={isRecording ? 'stop' : 'mic'} size={36} color="#FFFFFF" />
        </Pressable>

        <Text style={styles.greeting}>{isRecording ? 'Listening...' : 'How can I help?'}</Text>
        <Text style={styles.subtitle}>
          Start a chat by speaking or typing. The assistant will convert the command to text,
          execute it, and show the response.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFF',
  },
  content: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
    transform: [{ translateY: 18 }],
  },
  logoMark: {
    alignItems: 'center',
    height: 96,
    justifyContent: 'center',
    marginBottom: 28,
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
  voiceButton: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: 36,
    elevation: 5,
    height: 72,
    justifyContent: 'center',
    marginBottom: 28,
    shadowColor: '#1A73E8',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    width: 72,
  },
  recordingButton: {
    backgroundColor: '#EA4335',
    shadowColor: '#EA4335',
  },
  greeting: {
    color: '#202124',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1.1,
    textAlign: 'center',
  },
  subtitle: {
    color: '#5F6368',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
    maxWidth: 330,
    textAlign: 'center',
  },
});