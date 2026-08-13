import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PageHeader } from '@/components/page-header';
import { ScreenShell } from '@/components/screen';
import {
  UiControlHeights,
  UiRadii,
  UiSpacing,
  UiTypography,
} from '@/constants/theme';
import { getConversation, listConversationMessages, sendMessage, updateConversation } from '@/lib/api/ghl';
import type { GhlConversationSummary, GhlMessageSummary } from '@/lib/api/types';
import { useAppTheme } from '@/lib/theme/theme-provider';

// ─── Channel helpers ─────────────────────────────────────────────────────────

const CHANNEL_ICONS: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  sms: 'sms',
  email: 'email',
  whatsapp: 'chat',
  facebook: 'facebook',
  instagram: 'photo-camera',
  live_chat: 'chat-bubble',
};

const CHANNEL_LABELS: Record<string, string> = {
  sms: 'SMS',
  email: 'Email',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  live_chat: 'Live Chat',
};

function channelIcon(channel?: unknown): keyof typeof MaterialIcons.glyphMap {
  if (typeof channel !== 'string' || !channel) return 'chat-bubble-outline';
  return CHANNEL_ICONS[channel.toLowerCase()] ?? 'chat-bubble-outline';
}

function channelLabel(channel?: unknown): string {
  if (typeof channel !== 'string' || !channel) return 'Chat';
  return CHANNEL_LABELS[channel.toLowerCase()] ?? channel;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function GhlConversationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useAppTheme();

  const [conversation, setConversation] = useState<GhlConversationSummary | null>(null);
  const [messages, setMessages] = useState<GhlMessageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Send message state
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [isInternalComment, setIsInternalComment] = useState(false);

  const fetchDetails = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const [convRes, msgsRes] = await Promise.all([
        getConversation(id),
        listConversationMessages(id, { limit: 100 }),
      ]);
      setConversation(convRes);

      // Mark as read on entry.
      if (convRes.unreadCount && convRes.unreadCount > 0) {
        await updateConversation(id, { unreadCount: 0 });
        setConversation((prev) => (prev ? { ...prev, unreadCount: 0 } : prev));
      }

      // Sort messages chronologically (oldest → newest).
      const sortedMsgs = msgsRes.messages.sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return da - db;
      });
      setMessages(sortedMsgs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const flatListRef = useRef<FlatList>(null);

  // Scroll to bottom when messages load.
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
    }
  }, [messages]);

  // ─── Star toggle in header ───────────────────────────────────────────────
  async function handleStarToggle() {
    if (!conversation || !id) return;
    const newStarred = !(conversation.starred ?? false);
    // Optimistic update.
    setConversation((prev) => (prev ? { ...prev, starred: newStarred } : prev));
    try {
      await updateConversation(id, { starred: newStarred });
    } catch {
      // Revert on failure.
      setConversation((prev) => (prev ? { ...prev, starred: !newStarred } : prev));
    }
  }

  // ─── Send message handler ────────────────────────────────────────────────
  async function handleSend() {
    const text = inputText.trim();
    if (!text || !id || sending) return;

    setSending(true);
    setInputText('');

    const messageType = isInternalComment ? 'InternalComment' : 'SMS';

    // Optimistic message append
    const tempMsg: GhlMessageSummary = {
      id: `temp-${Date.now()}`,
      conversationId: id,
      contactId: conversation?.contactId,
      direction: 'outbound',
      type: messageType,
      body: text,
      attachments: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      await sendMessage({
        type: messageType,
        conversationId: id,
        contactId: conversation?.contactId,
        message: text,
      });
      // Refetch messages to get true server state
      fetchDetails();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
    } finally {
      setSending(false);
    }
  }

  // ─── Render message bubble ───────────────────────────────────────────────
  function renderMessage({ item }: { item: GhlMessageSummary }) {
    const isOutbound = item.direction === 'outbound';
    const isInternal = item.type === 'InternalComment' || item.type === 'TYPE_INTERNAL_COMMENT';

    return (
      <View style={[styles.messageWrapper, isOutbound ? styles.messageWrapperOutbound : styles.messageWrapperInbound]}>
        <View style={[
          styles.messageBubble,
          isInternal
            ? [styles.messageBubbleInternal, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]
            : isOutbound
            ? [styles.messageBubbleOutbound, { backgroundColor: colors.primary }]
            : [styles.messageBubbleInbound, { backgroundColor: colors.surface }]
        ]}>
          {isInternal && (
            <Text style={[styles.internalBadge, { color: '#B45309' }]}>Internal Comment</Text>
          )}
          <Text style={[
            styles.messageText,
            isInternal
              ? { color: '#92400E' }
              : isOutbound
              ? styles.messageTextOutbound
              : { color: colors.textPrimary }
          ]}>
            {item.body || (item.attachments?.length ? '[Attachment]' : '')}
          </Text>
          {item.createdAt && (
            <Text style={[
              styles.messageTime,
              isInternal
                ? { color: '#B45309' }
                : isOutbound
                ? styles.messageTimeOutbound
                : { color: colors.textMuted }
            ]}>
              {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <ScreenShell>
      <PageHeader
        title={conversation?.contactName || 'Conversation'}
        showBack
        onBack={() => router.back()}
        right={
          <View style={styles.headerActions}>
            {/* Star toggle */}
            <Pressable onPress={handleStarToggle} hitSlop={8}>
              <MaterialIcons
                name={conversation?.starred ? 'star' : 'star-border'}
                size={24}
                color={conversation?.starred ? '#FBBC04' : colors.textMuted}
              />
            </Pressable>
            {/* Refresh */}
            <Pressable onPress={() => fetchDetails()} hitSlop={8}>
              <MaterialIcons name="refresh" size={24} color={colors.primary} />
            </Pressable>
          </View>
        }
      />

      {/* Channel type indicator bar */}
      {conversation?.channel && (
        <View style={[styles.channelBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <MaterialIcons
            name={channelIcon(conversation.channel)}
            size={16}
            color={colors.primary}
          />
          <Text style={[styles.channelLabel, { color: colors.textMuted }]}>
            {channelLabel(conversation.channel)}
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          <Pressable onPress={() => fetchDetails()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.container}>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messageList}
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No messages found.
              </Text>
            }
          />

          {/* Chat input bar */}
          <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            {/* Mode toggle button */}
            <Pressable
              onPress={() => setIsInternalComment(!isInternalComment)}
              style={[
                styles.modeToggle,
                isInternalComment
                  ? { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }
                  : { backgroundColor: colors.background, borderColor: colors.border }
              ]}
            >
              <MaterialIcons
                name={isInternalComment ? 'lock' : 'send'}
                size={16}
                color={isInternalComment ? '#B45309' : colors.textMuted}
              />
              <Text style={[
                styles.modeToggleText,
                { color: isInternalComment ? '#B45309' : colors.textMuted }
              ]}>
                {isInternalComment ? 'Internal' : 'SMS'}
              </Text>
            </Pressable>

            {/* Input field */}
            <TextInput
              style={[styles.textInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
              placeholder={isInternalComment ? 'Type an internal note...' : 'Type a message...'}
              placeholderTextColor={colors.textMuted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={2000}
            />

            {/* Send button */}
            <Pressable
              onPress={handleSend}
              disabled={sending || !inputText.trim()}
              style={[
                styles.sendBtn,
                { backgroundColor: inputText.trim() && !sending ? colors.primary : colors.border }
              ]}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <MaterialIcons name="arrow-upward" size={20} color="#FFF" />
              )}
            </Pressable>
          </View>
        </View>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    alignSelf: 'center',
    flex: 1,
    justifyContent: 'center',
    maxWidth: 720,
    padding: UiSpacing.xl,
    width: '100%',
  },
  container: {
    flex: 1,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  channelBar: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  channelLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  messageList: {
    alignSelf: 'center',
    maxWidth: 720,
    padding: UiSpacing.lg,
    paddingBottom: UiSpacing.xxxl,
    width: '100%',
  },
  messageWrapper: {
    flexDirection: 'row',
    marginBottom: UiSpacing.md,
    width: '100%',
  },
  messageWrapperInbound: {
    justifyContent: 'flex-start',
  },
  messageWrapperOutbound: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    borderRadius: UiRadii.card,
    maxWidth: '80%',
    paddingHorizontal: UiSpacing.md,
    paddingVertical: UiSpacing.sm,
  },
  messageBubbleInbound: {
    borderBottomLeftRadius: 4,
    borderColor: '#E5E7EB',
    borderWidth: 1,
  },
  messageBubbleOutbound: {
    borderBottomRightRadius: 4,
  },
  messageText: {
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  messageTextOutbound: {
    color: '#FFF',
  },
  messageTime: {
    fontSize: UiTypography.caption.fontSize,
    lineHeight: UiTypography.caption.lineHeight,
    marginTop: UiSpacing.xxs,
    textAlign: 'right',
  },
  messageTimeOutbound: {
    color: 'rgba(255,255,255,0.7)',
  },
  emptyText: {
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    marginTop: 40,
    textAlign: 'center',
  },
  errorText: {
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    marginBottom: UiSpacing.lg,
    textAlign: 'center',
  },
  retryBtn: {
    alignItems: 'center',
    borderRadius: UiRadii.control,
    justifyContent: 'center',
    minHeight: UiControlHeights.button,
    paddingHorizontal: UiSpacing.lg,
  },
  retryBtnText: {
    color: '#FFF',
    fontWeight: '600',
  },
  inputBar: {
    alignItems: 'center',
    alignSelf: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 8,
    maxWidth: 720,
    paddingHorizontal: UiSpacing.md,
    paddingVertical: UiSpacing.sm,
    width: '100%',
  },
  modeToggle: {
    alignItems: 'center',
    borderRadius: UiRadii.pill ?? 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  modeToggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  textInput: {
    borderRadius: UiRadii.control,
    borderWidth: 1,
    flex: 1,
    fontSize: UiTypography.bodySmall.fontSize,
    maxHeight: 100,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sendBtn: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  messageBubbleInternal: {
    borderWidth: 1,
  },
  internalBadge: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
});
