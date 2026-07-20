import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { ScreenShell } from '@/components/screen';
import { AssistantChat, useAssistantHistory } from '@/lib/assistant-history';
import { useAppTheme } from '@/lib/theme/theme-provider';

export function HistoryScreenContent() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { chats, clearAllChats, createChat, deleteChat, openChat } = useAssistantHistory();

  const sortedChats = [...chats].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  async function startNewChat() {
    const id = await createChat();
    router.push({ pathname: '/chat', params: { conversationId: id } });
  }

  function confirmDeleteChat(chat: AssistantChat) {
    Alert.alert('Delete chat?', 'This removes the whole conversation.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void deleteChat(chat.id),
      },
    ]);
  }

  function openConversation(chat: AssistantChat) {
    openChat(chat.id);
    router.push({ pathname: '/chat', params: { conversationId: chat.id } });
  }

  return (
    <ScreenShell>
      <PageHeader
        title="History"
        showBack
        right={
          <View style={styles.historyCount}>
            <Text style={styles.historyCountText}>{chats.length}</Text>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
        overScrollMode="never">
        <Text style={styles.subtitle}>
          Each block is one conversation. Open a chat to see all messages, or start a new one.
        </Text>
        <Pressable style={styles.newChatButton} onPress={startNewChat}>
          <MaterialIcons name="add-comment" size={22} color={colors.onPrimary} />
          <Text style={styles.newChatButtonText}>New chat</Text>
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Conversations</Text>
          <Pressable disabled={chats.length === 0} onPress={clearAllChats}>
            <Text style={[styles.sectionAction, chats.length === 0 && styles.disabledAction]}>
              Clear all
            </Text>
          </Pressable>
        </View>

        {chats.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialIcons name="forum" size={34} color={colors.primary} />
            <Text style={styles.emptyTitle}>No chats yet</Text>
            <Text style={styles.emptyText}>
              Start a new chat to talk with the assistant. All messages in that session stay inside
              one block here.
            </Text>
            <Pressable style={styles.emptyCta} onPress={startNewChat}>
              <Text style={styles.emptyCtaText}>New chat</Text>
            </Pressable>
          </View>
        ) : (
          sortedChats.map((chat) => (
            <View key={chat.id} style={styles.chatBlock}>
              <Pressable
                style={styles.chatBlockPressable}
                onPress={() => openConversation(chat)}
                accessibilityRole="button"
                accessibilityLabel={`Open chat from ${formatTimestamp(chat.updatedAt)}`}>
                <View style={styles.chatBlockIcon}>
                  <MaterialIcons name="chat-bubble-outline" size={26} color={colors.primary} />
                </View>
                <View style={styles.chatBlockBody}>
                  <View style={styles.chatBlockTop}>
                    <Text style={styles.chatBlockTitle} numberOfLines={1}>
                      {chat.title?.trim() || 'Contact chat'}
                    </Text>
                    <View style={styles.messagePill}>
                      <Text style={styles.messagePillText}>
                        {chat.messageCount ?? chat.messages.length} messages
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.chatBlockPreview} numberOfLines={2}>
                    {previewText(chat)}
                  </Text>
                  <Text style={styles.timestamp}>Updated {formatTimestamp(chat.updatedAt)}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={24} color={colors.iconMuted} />
              </Pressable>
              <Pressable
                style={styles.deleteChatButton}
                onPress={() => confirmDeleteChat(chat)}
                accessibilityLabel="Delete conversation">
                <MaterialIcons name="delete-outline" size={22} color={colors.danger} />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </ScreenShell>
  );
}

function previewText(chat: AssistantChat) {
  if (chat.messages.length === 0) {
    return 'No messages yet — open to start the conversation.';
  }
  const last = chat.messages[chat.messages.length - 1];
  return last.command;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 12,
    paddingTop: 20,
    paddingBottom: 36,
  },
  historyCount: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    minWidth: 32,
    paddingHorizontal: 8,
  },
  historyCountText: {
    color: '#1A73E8',
    fontSize: 15,
    fontWeight: '600',
  },
  subtitle: {
    color: '#5F6368',
    fontSize: 16,
    lineHeight: 24,
  },
  newChatButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#1A73E8',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  newChatButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#202124',
    fontSize: 20,
    fontWeight: '600',
  },
  sectionAction: {
    color: '#1A73E8',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledAction: {
    color: '#BDC1C6',
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 16,
    borderWidth: 1,
    padding: 26,
  },
  emptyTitle: {
    color: '#202124',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
  emptyText: {
    color: '#5F6368',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
    textAlign: 'center',
  },
  emptyCta: {
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#E8F0FE',
    borderRadius: 12,
  },
  emptyCtaText: {
    color: '#174EA6',
    fontSize: 15,
    fontWeight: '600',
  },
  chatBlock: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 12,
    overflow: 'hidden',
  },
  chatBlockPressable: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 16,
  },
  deleteChatButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  chatBlockIcon: {
    alignItems: 'center',
    backgroundColor: '#EDF4FF',
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  chatBlockBody: {
    flex: 1,
    minWidth: 0,
  },
  chatBlockTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  chatBlockTitle: {
    color: '#202124',
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
  },
  messagePill: {
    backgroundColor: '#F1F3F4',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  messagePillText: {
    color: '#5F6368',
    fontSize: 12,
    fontWeight: '600',
  },
  chatBlockPreview: {
    color: '#5F6368',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  timestamp: {
    color: '#80868B',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
});
