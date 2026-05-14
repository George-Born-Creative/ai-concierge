import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AssistantHistoryEntry, useAssistantHistory } from '@/lib/assistant-history';
import { useToast } from '@/lib/toast';

const suggestions = [
  'List latest contacts',
  'Find contact Sarah',
  'Identify 5551234567',
  'Create contact Alex 5551234567',
  'Delete contact Alex',
];

export default function ChatScreen() {
  const router = useRouter();
  const { show } = useToast();
  const params = useLocalSearchParams<{
    command?: string;
    source?: AssistantHistoryEntry['source'];
    voiceUri?: string;
    conversationId?: string;
  }>();
  const { activeMessages, addVoiceMessage, openChat, runCommand } = useAssistantHistory();
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const commandHandledKey = useRef<string | null>(null);
  const voiceHandledKey = useRef<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const submitCommand = useCallback(
    async (command: string, source: AssistantHistoryEntry['source'] = 'text') => {
      const trimmedCommand = command.trim();

      if (!trimmedCommand || isRunning) {
        return;
      }

      setInput('');
      setIsRunning(true);

      try {
        await runCommand(trimmedCommand, source);
      } finally {
        setIsRunning(false);
      }
    },
    [isRunning, runCommand]
  );

  useEffect(() => {
    const convId = paramOne(params.conversationId);
    if (convId) {
      openChat(convId);
    }
  }, [params.conversationId, openChat]);

  useEffect(() => {
    const command = paramOne(params.command);
    if (!command) {
      return;
    }
    const convId = paramOne(params.conversationId);
    const key = `${convId ?? ''}::${command}`;
    if (commandHandledKey.current === key) {
      return;
    }
    commandHandledKey.current = key;
    if (convId) {
      openChat(convId);
    }
    const source = (paramOne(params.source) as AssistantHistoryEntry['source'] | undefined) ?? 'text';
    void submitCommand(command, source);
  }, [params.command, params.conversationId, params.source, openChat, submitCommand]);

  useEffect(() => {
    const voiceUri = paramOne(params.voiceUri);
    if (!voiceUri) {
      return;
    }
    const convId = paramOne(params.conversationId);
    const key = `${convId ?? ''}::${voiceUri}`;
    if (voiceHandledKey.current === key) {
      return;
    }
    voiceHandledKey.current = key;
    if (convId) {
      openChat(convId);
    }
    addVoiceMessage(voiceUri);
  }, [params.voiceUri, params.conversationId, openChat, addVoiceMessage]);

  useEffect(() => {
    if (activeMessages.length > 0) {
      scrollToBottom();
    }
  }, [activeMessages, scrollToBottom]);

  function startVoiceCommand() {
    show('Speech-to-text UI is ready. Add a speech recognition package to send transcripts here.', 'info');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color="#202124" />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>AI Concierge</Text>
            <Text style={styles.title}>Contact chat</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>D</Text>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.chatScroll}
          contentContainerStyle={styles.chatContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToBottom}>
          {activeMessages.length === 0 ? (
            <View style={styles.heroCard}>
              <View style={styles.assistantMark}>
                <View style={[styles.dot, styles.blueDot]} />
                <View style={[styles.dot, styles.redDot]} />
                <View style={[styles.dot, styles.yellowDot]} />
                <View style={[styles.dot, styles.greenDot]} />
              </View>
              <Text style={styles.heroTitle}>Ask me to manage contacts</Text>
              <Text style={styles.heroText}>
                I can list latest contacts, identify people, fetch a contact, create one, or delete
                one.
              </Text>
            </View>
          ) : (
            activeMessages.map((entry) => <CommandBubble key={entry.id} entry={entry} />)
          )}
        </ScrollView>

        <View style={styles.suggestionRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {suggestions.map((suggestion) => (
              <Pressable
                key={suggestion}
                style={styles.suggestionChip}
                onPress={() => submitCommand(suggestion)}>
                <Text style={styles.suggestionText}>{suggestion}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.composer}>
          <Pressable style={styles.micButton} onPress={startVoiceCommand}>
            <MaterialIcons name="mic" size={25} color="#FFFFFF" />
          </Pressable>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Say or type a contact command"
            placeholderTextColor="#80868B"
            style={styles.input}
            returnKeyType="send"
            onSubmitEditing={() => submitCommand(input)}
          />
          <Pressable
            style={[styles.sendButton, (!input.trim() || isRunning) && styles.disabledButton]}
            onPress={() => submitCommand(input)}
            disabled={!input.trim() || isRunning}>
            {isRunning ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <MaterialIcons name="send" size={22} color="#FFFFFF" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function paramOne(value: string | string[] | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
}

function CommandBubble({ entry }: { entry: AssistantHistoryEntry }) {
  return (
    <View style={styles.commandGroup}>
      <View style={styles.userBubble}>
        <Text style={styles.bubbleLabel}>{entry.source === 'voice' ? 'Voice command' : 'Command'}</Text>
        <Text style={styles.userText}>{entry.command}</Text>
        {entry.voiceUri ? <Text style={styles.voiceAttachment}>Audio attached</Text> : null}
      </View>
      <View style={[styles.assistantBubble, entry.status === 'error' && styles.errorBubble]}>
        <Text style={styles.bubbleLabel}>Response</Text>
        <Text style={styles.assistantText}>{entry.response}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFF',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E8EAED',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 16,
    paddingHorizontal: 12,
    paddingTop: 26,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#F1F3F4',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: '#5F6368',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: '#202124',
    fontSize: 22,
    fontWeight: '600',
    marginTop: 2,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  avatarText: {
    color: '#1A73E8',
    fontSize: 18,
    fontWeight: '600',
  },
  chatScroll: {
    flex: 1,
  },
  chatContent: {
    flexGrow: 1,
    gap: 18,
    paddingHorizontal: 12,
    paddingTop: 20,
    paddingBottom: 16,
  },
  heroCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
  },
  assistantMark: {
    alignItems: 'center',
    height: 70,
    justifyContent: 'center',
    marginBottom: 14,
    width: 70,
  },
  dot: {
    borderRadius: 18,
    position: 'absolute',
  },
  blueDot: {
    backgroundColor: '#4285F4',
    height: 40,
    left: 6,
    width: 40,
  },
  redDot: {
    backgroundColor: '#EA4335',
    height: 26,
    right: 9,
    top: 9,
    width: 26,
  },
  yellowDot: {
    backgroundColor: '#FBBC04',
    bottom: 10,
    height: 24,
    right: 12,
    width: 24,
  },
  greenDot: {
    backgroundColor: '#34A853',
    bottom: 14,
    height: 18,
    left: 18,
    width: 18,
  },
  heroTitle: {
    color: '#202124',
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
  heroText: {
    color: '#5F6368',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
  commandGroup: {
    gap: 10,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#1A73E8',
    borderRadius: 14,
    maxWidth: '86%',
    padding: 14,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 14,
    borderWidth: 1,
    maxWidth: '92%',
    padding: 14,
  },
  errorBubble: {
    backgroundColor: '#FCE8E6',
    borderColor: '#FAD2CF',
  },
  bubbleLabel: {
    color: '#80868B',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.7,
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  userText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 23,
  },
  voiceAttachment: {
    color: '#D2E3FC',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    textTransform: 'uppercase',
  },
  assistantText: {
    color: '#202124',
    fontSize: 15,
    lineHeight: 22,
  },
  suggestionRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  suggestionChip: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DADCE0',
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 10,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  suggestionText: {
    color: '#202124',
    fontSize: 14,
    fontWeight: '600',
  },
  composer: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E8EAED',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  micButton: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: 14,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  input: {
    backgroundColor: '#F1F3F4',
    borderRadius: 24,
    color: '#202124',
    flex: 1,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: '#34A853',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  disabledButton: {
    opacity: 0.45,
  },
});
