import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
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

import { AIConciergeVoiceRecorder } from '@/components/ai-concierge-voice-recorder';
import {
  ChatVoiceActivity,
  ChatVoiceWaveOverlay,
} from '@/components/chat/chat-voice-wave-overlay';
import { Skeleton, SkeletonLines } from '@/components/ui/skeleton';
import { AssistantHistoryEntry, useAssistantHistory } from '@/lib/assistant-history';
import { useToast } from '@/lib/toast';

export default function ChatScreen() {
  const router = useRouter();
  const { show } = useToast();
  const params = useLocalSearchParams<{
    command?: string;
    source?: AssistantHistoryEntry['source'];
    voiceUri?: string;
    conversationId?: string;
  }>();
  const {
    activeChatId,
    activeMessages,
    addVoiceMessage,
    cancelPendingMessages,
    createChat,
    deleteMessage,
    loading: historyLoading,
    openChat,
    runCommand,
  } = useAssistantHistory();
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [voiceActivity, setVoiceActivity] = useState<ChatVoiceActivity>('idle');
  const hasPendingMessage = isRunning || activeMessages.some((m) => m.pending);
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
        const convId = paramOne(params.conversationId) ?? activeChatId ?? undefined;
        await runCommand(trimmedCommand, source, convId);
      } finally {
        setIsRunning(false);
      }
    },
    [activeChatId, isRunning, params.conversationId, runCommand]
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
    addVoiceMessage(voiceUri, convId);
  }, [params.voiceUri, params.conversationId, openChat, addVoiceMessage]);

  useEffect(() => {
    if (activeMessages.length > 0 || isRunning) {
      scrollToBottom();
    }
  }, [activeMessages, isRunning, scrollToBottom]);

  async function handleVoiceRecorded(voiceUri: string) {
    let convId = paramOne(params.conversationId) ?? activeChatId;
    if (!convId) {
      convId = await createChat();
    } else {
      openChat(convId);
    }
    addVoiceMessage(voiceUri, convId);
    scrollToBottom();
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
            <Text style={styles.title}>Chat</Text>
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
          {historyLoading && activeMessages.length === 0 ? (
            <ChatSkeleton />
          ) : activeMessages.length === 0 && !isRunning ? (
            <View style={styles.heroCard}>
              <View style={styles.assistantMark}>
                <View style={[styles.dot, styles.blueDot]} />
                <View style={[styles.dot, styles.redDot]} />
                <View style={[styles.dot, styles.yellowDot]} />
                <View style={[styles.dot, styles.greenDot]} />
              </View>
              <Text style={styles.heroTitle}>How can I help?</Text>
              <Text style={styles.heroText}>
                Ask me about your contacts, calendar, appointments, pipelines, or opportunities —
                or just chat.
              </Text>
            </View>
          ) : (
            activeMessages.map((entry) => (
              <CommandBubble
                key={entry.id}
                entry={entry}
                onDelete={
                  activeChatId
                    ? () => confirmDeleteMessage(activeChatId, entry.id, deleteMessage)
                    : undefined
                }
              />
            ))
          )}
        </ScrollView>

        <ChatVoiceWaveOverlay activity={voiceActivity} />

        <View style={styles.composer}>
          <AIConciergeVoiceRecorder
            variant="composer"
            disabled={isRunning}
            onActivityChange={setVoiceActivity}
            onAudioRecorded={handleVoiceRecorded}
            onError={(message) => show(message, 'error')}
          />
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Say or type a command"
            placeholderTextColor="#80868B"
            style={styles.input}
            returnKeyType="send"
            onSubmitEditing={() => submitCommand(input)}
          />
          {hasPendingMessage ? (
            <Pressable
              style={styles.stopButton}
              onPress={() => {
                const chatId = paramOne(params.conversationId) ?? activeChatId;
                if (chatId) cancelPendingMessages(chatId);
                setIsRunning(false);
              }}
              accessibilityLabel="Stop processing">
              <MaterialIcons name="stop" size={22} color="#FFFFFF" />
            </Pressable>
          ) : (
            <Pressable
              style={[styles.sendButton, !input.trim() && styles.disabledButton]}
              onPress={() => submitCommand(input)}
              disabled={!input.trim()}>
              <MaterialIcons name="send" size={22} color="#FFFFFF" />
            </Pressable>
          )}
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

function confirmDeleteMessage(
  conversationId: string,
  messageId: string,
  deleteMessage: (conversationId: string, messageId: string) => Promise<void>,
) {
  Alert.alert('Delete message?', 'This removes the command and response from this chat.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: () => void deleteMessage(conversationId, messageId),
    },
  ]);
}

function CommandBubble({
  entry,
  onDelete,
}: {
  entry: AssistantHistoryEntry;
  onDelete?: () => void;
}) {
  const userText = voiceUserText(entry);
  const timeLabel = formatMessageTime(entry.createdAt);

  return (
    <Pressable
      style={styles.commandGroup}
      onLongPress={onDelete}
      delayLongPress={400}
      disabled={!onDelete || entry.pending}>
      <View>
        <View style={[styles.userBubble, entry.pending && styles.pendingUserBubble]}>
          <Text style={styles.bubbleLabel}>{entry.source === 'voice' ? 'You said' : 'You'}</Text>
          <Text style={styles.userText} selectable>
            {userText}
          </Text>
        </View>
        {timeLabel ? <Text style={styles.userTimestamp}>{timeLabel}</Text> : null}
      </View>
      {entry.pending ? (
        <View>
          <View style={[styles.assistantBubble, styles.pendingAssistantBubble]}>
            <Text style={styles.bubbleLabel}>{entry.response || 'Working on it…'}</Text>
            <SkeletonLines lines={3} lineHeight={11} gap={8} lastLineWidth="55%" />
          </View>
        </View>
      ) : (
        <View>
          <View style={[styles.assistantBubble, entry.status === 'error' && styles.errorBubble]}>
            <Text style={styles.bubbleLabel}>Response</Text>
            <Text style={styles.assistantText} selectable>
              {entry.response}
            </Text>
          </View>
          {timeLabel ? <Text style={styles.assistantTimestamp}>{timeLabel}</Text> : null}
        </View>
      )}
    </Pressable>
  );
}

function ChatSkeleton() {
  return (
    <View style={{ gap: 18 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.commandGroup}>
          <View style={styles.skeletonUserBubble}>
            <Skeleton width="70%" height={12} radius={6} style={{ backgroundColor: '#94B6F2' }} />
            <Skeleton
              width="45%"
              height={12}
              radius={6}
              style={{ backgroundColor: '#94B6F2', marginTop: 8 }}
            />
          </View>
          <View style={styles.skeletonAssistantBubble}>
            <SkeletonLines lines={3} lineHeight={11} gap={8} lastLineWidth="60%" />
          </View>
        </View>
      ))}
    </View>
  );
}

function formatMessageTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function voiceUserText(entry: AssistantHistoryEntry): string {
  if (entry.source !== 'voice') {
    return entry.command;
  }

  const transcript = entry.transcript?.trim() || entry.command.trim();
  if (transcript && transcript !== 'Voice message') {
    return transcript;
  }

  if (entry.pending) {
    return 'Transcribing your voice…';
  }

  return entry.command;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFF',
  },
  keyboardView: {
    flex: 1,
    position: 'relative',
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
  pendingUserBubble: {
    opacity: 0.95,
  },
  pendingAssistantBubble: {
    backgroundColor: '#F8FAFF',
    borderColor: '#D2E3FC',
  },
  skeletonUserBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#1A73E8',
    borderRadius: 14,
    maxWidth: '70%',
    minWidth: 180,
    opacity: 0.85,
    padding: 14,
  },
  skeletonAssistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 14,
    borderWidth: 1,
    maxWidth: '85%',
    minWidth: 220,
    padding: 14,
  },
  assistantText: {
    color: '#202124',
    fontSize: 15,
    lineHeight: 22,
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
  stopButton: {
    alignItems: 'center',
    backgroundColor: '#EA4335',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  disabledButton: {
    opacity: 0.45,
  },
  userTimestamp: {
    alignSelf: 'flex-end',
    color: '#80868B',
    fontSize: 11,
    marginTop: 4,
    marginRight: 4,
  },
  assistantTimestamp: {
    alignSelf: 'flex-start',
    color: '#80868B',
    fontSize: 11,
    marginTop: 4,
    marginLeft: 4,
  },
});
