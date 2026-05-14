import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AIConciergeVoiceRecorder } from '@/components/ai-concierge-voice-recorder';
import { useAssistantHistory } from '@/lib/assistant-history';
import { useToast } from '@/lib/toast';

export function VoiceAssistantTabButton() {
  const router = useRouter();
  const { show } = useToast();
  const { activeChatId, createChat } = useAssistantHistory();

  function sendAudio(voiceUri: string) {
    const conversationId = activeChatId ?? createChat();
    router.push({
      pathname: '/chat',
      params: {
        source: 'voice',
        voiceUri,
        conversationId,
      },
    });
  }

  return (
    <View style={styles.voiceTabButton}>
      <AIConciergeVoiceRecorder
        onAudioRecorded={sendAudio}
        onError={(message) => show(message, 'error')}
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
