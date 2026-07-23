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
import { getConversation, listConversationMessages } from '@/lib/api/ghl';
import type { GhlConversationSummary, GhlMessageSummary } from '@/lib/api/types';
import { useAppTheme } from '@/lib/theme/theme-provider';

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
      // Messages are typically returned oldest-to-newest or newest-to-oldest.
      // Usually chat UIs render newest at the bottom, so if we use inverted FlatList,
      // we need newest at index 0. We'll assume the API returns newest first (descending).
      // If not, we can reverse it here. For now, let's just reverse it if we want inverted=false,
      // but typical React Native chats use inverted={true} and pass newest first.
      // Let's stick to standard top-to-bottom for now, assuming chronological order.
      // We will sort them by createdAt ascending just to be safe.
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

  // Scroll to bottom when messages load
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
    }
  }, [messages]);

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
          <Pressable onPress={() => fetchDetails()} hitSlop={8}>
            <MaterialIcons name="refresh" size={24} color={colors.primary} />
          </Pressable>
        }
      />
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
