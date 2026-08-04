import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PageHeader } from '@/components/page-header';
import { ScreenShell } from '@/components/screen';
import { getConversation, listConversationMessages, updateConversation } from '@/lib/api/ghl';
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

function channelIcon(channel?: string): keyof typeof MaterialIcons.glyphMap {
  if (!channel) return 'chat-bubble-outline';
  return CHANNEL_ICONS[channel.toLowerCase()] ?? 'chat-bubble-outline';
}

function channelLabel(channel?: string): string {
  if (!channel) return 'Chat';
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

  // ─── Render message bubble ───────────────────────────────────────────────
  function renderMessage({ item }: { item: GhlMessageSummary }) {
    const isOutbound = item.direction === 'outbound';

    return (
      <View style={[styles.messageWrapper, isOutbound ? styles.messageWrapperOutbound : styles.messageWrapperInbound]}>
        <View style={[
          styles.messageBubble,
          isOutbound ? [styles.messageBubbleOutbound, { backgroundColor: colors.primary }] : [styles.messageBubbleInbound, { backgroundColor: colors.surface }]
        ]}>
          <Text style={[styles.messageText, isOutbound ? styles.messageTextOutbound : { color: colors.textPrimary }]}>
            {item.body || (item.attachments?.length ? '[Attachment]' : '')}
          </Text>
          {item.createdAt && (
            <Text style={[styles.messageTime, isOutbound ? styles.messageTimeOutbound : { color: colors.textMuted }]}>
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
        </View>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
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
    padding: 16,
    paddingBottom: 32,
  },
  messageWrapper: {
    flexDirection: 'row',
    marginBottom: 12,
    width: '100%',
  },
  messageWrapperInbound: {
    justifyContent: 'flex-start',
  },
  messageWrapperOutbound: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    borderRadius: 16,
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
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
    fontSize: 15,
    lineHeight: 22,
  },
  messageTextOutbound: {
    color: '#FFF',
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
    textAlign: 'right',
  },
  messageTimeOutbound: {
    color: 'rgba(255,255,255,0.7)',
  },
  emptyText: {
    fontSize: 15,
    marginTop: 40,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 15,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryBtn: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryBtnText: {
    color: '#FFF',
    fontWeight: '600',
  },
});
