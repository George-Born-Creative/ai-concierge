import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AIConciergeVoiceRecorder } from '@/components/ai-concierge-voice-recorder';
import { useAssistantHistory } from '@/lib/assistant-history';
import { useToast } from '@/lib/toast';

export function VoiceAssistantTabButton(props: BottomTabBarButtonProps) {
  const { accessibilityState, children, style, testID } = props;
  const router = useRouter();
  const { show } = useToast();
  const { activeChatId, addVoiceMessage, createChat } = useAssistantHistory();

  function sendAudio(voiceUri: string) {
    const conversationId = activeChatId ?? createChat();
    // Pass the file URI through context — router params break on file:// paths.
    addVoiceMessage(voiceUri, conversationId);
    router.push({
      pathname: '/chat',
      params: { conversationId },
    });
  }

  return (
    <View
      accessibilityState={accessibilityState}
      testID={testID}
      style={[style, styles.voiceTabButton]}>
      <AIConciergeVoiceRecorder
        onAudioRecorded={sendAudio}
        onError={(message) => show(message, 'error')}
      />
      {children}
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
