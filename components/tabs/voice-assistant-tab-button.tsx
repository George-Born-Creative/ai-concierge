import { useRouter } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { AIConciergeVoiceRecorder } from '@/components/ai-concierge-voice-recorder';

export function VoiceAssistantTabButton() {
  const router = useRouter();

  function sendAudio(voiceUri: string) {
    router.push({
      pathname: '/chat',
      params: {
        source: 'voice',
        voiceUri,
      },
    });
  }

  return (
    <View style={styles.voiceTabButton}>
      <AIConciergeVoiceRecorder
        apiEndpoint={process.env.EXPO_PUBLIC_VOICE_API_ENDPOINT}
        onAudioRecorded={sendAudio}
        onError={(message) => Alert.alert('Voice recording', message)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  voiceTabButton: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    marginTop: -36,
  },
});
