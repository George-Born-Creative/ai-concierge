import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AIConciergeVoiceRecorder } from '@/components/ai-concierge-voice-recorder';
import { useAssistantHistory } from '@/lib/assistant-history';
import { useToast } from '@/lib/toast';

export function VoiceAssistantTabButton(props: BottomTabBarButtonProps) {
  const { accessibilityState, style, testID } = props;
  const router = useRouter();
  const { show } = useToast();
  const { activeChatId, addVoiceMessage, createChat } = useAssistantHistory();

  async function sendAudio(voiceUri: string) {
    const conversationId = activeChatId ?? (await createChat());
    addVoiceMessage(voiceUri, conversationId);
    router.push({
      pathname: '/chat',
      params: { conversationId },
    });
  }

  // Intentionally not rendering React Navigation's default tab `children`
  // (the placeholder icon slot). The mic IS the tab — nothing should sit
  // under it.
  return (
    <View
      accessibilityState={accessibilityState}
      testID={testID}
      style={[style, styles.voiceTabButton]}>
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
    justifyContent: 'center',
    marginTop: -36,
    overflow: 'visible',
  },
});
