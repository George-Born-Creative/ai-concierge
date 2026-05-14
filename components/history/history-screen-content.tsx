import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AssistantChat, useAssistantHistory } from '@/lib/assistant-history';

export function HistoryScreenContent() {
  const router = useRouter();
  const { chats, clearAllChats, createChat, openChat } = useAssistantHistory();

  const sortedChats = [...chats].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  function startNewChat() {
    const id = createChat();
    router.push({ pathname: '/chat', params: { conversationId: id } });
  }

  function openConversation(chat: AssistantChat) {
    openChat(chat.id);
    router.push({ pathname: '/chat', params: { conversationId: chat.id } });
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>History</Text>
            <Text style={styles.title}>Your chats</Text>
          </View>
          <View style={styles.historyCount}>
            <Text style={styles.historyCountText}>{chats.length}</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          Each block is one conversation. Open a chat to see all messages, or start a new one.
        </Text>
        <Pressable style={styles.newChatButton} onPress={startNewChat}>
          <MaterialIcons name="add-comment" size={22} color="#FFFFFF" />
          <Text style={styles.newChatButtonText}>New chat</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
            <MaterialIcons name="forum" size={34} color="#1A73E8" />
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
            <Pressable
              key={chat.id}
              style={styles.chatBlock}
              onPress={() => openConversation(chat)}
              accessibilityRole="button"
              accessibilityLabel={`Open chat from ${formatTimestamp(chat.updatedAt)}`}>
              <View style={styles.chatBlockIcon}>
                <MaterialIcons name="chat-bubble-outline" size={26} color="#1A73E8" />
              </View>
              <View style={styles.chatBlockBody}>
                <View style={styles.chatBlockTop}>
                  <Text style={styles.chatBlockTitle}>Contact chat</Text>
                  <View style={styles.messagePill}>
                    <Text style={styles.messagePillText}>{chat.messages.length} messages</Text>
                  </View>
                </View>
                <Text style={styles.chatBlockPreview} numberOfLines={2}>
                  {previewText(chat)}
                </Text>
                <Text style={styles.timestamp}>Updated {formatTimestamp(chat.updatedAt)}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#9AA0A6" />
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
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
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFF',
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: 24,
    paddingBottom: 36,
  },
  header: {
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E8EAED',
    borderBottomWidth: 1,
    paddingBottom: 18,
    paddingHorizontal: 12,
    paddingTop: 28,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
  },
  headerCopy: {
    flex: 1,
  },
  historyCount: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  historyCountText: {
    color: '#1A73E8',
    fontSize: 18,
    fontWeight: '600',
  },
  kicker: {
    color: '#1A73E8',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#202124',
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: -0.8,
    lineHeight: 34,
  },
  subtitle: {
    color: '#5F6368',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
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
    gap: 14,
    marginBottom: 12,
    padding: 16,
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
