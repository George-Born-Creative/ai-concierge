import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { ScreenShell } from '@/components/screen';
import {
  UiControlHeights,
  UiRadii,
  UiSpacing,
  UiTypography,
} from '@/constants/theme';
import { AssistantChat, useAssistantHistory } from '@/lib/assistant-history';
import { useAppTheme } from '@/lib/theme/theme-provider';

export function HistoryScreenContent() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { chats, clearAllChats, createChat, deleteChat, openChat } = useAssistantHistory();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

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
    <ScreenShell edges={['bottom']}>
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>
          Each block is one conversation. Open a chat to see all messages, or start a new one.
        </Text>
        <Pressable style={styles.newChatButton} onPress={startNewChat}>
          <MaterialIcons name="add-comment" size={20} color={colors.onPrimary} />
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
            <MaterialIcons name="forum" size={30} color={colors.primary} />
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
                  <MaterialIcons name="chat-bubble-outline" size={22} color={colors.primary} />
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
                <MaterialIcons name="delete-outline" size={20} color={colors.danger} />
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
    alignSelf: 'center',
    maxWidth: 720,
    paddingBottom: UiSpacing.xxl,
    paddingHorizontal: UiSpacing.lg,
    paddingTop: UiSpacing.lg,
    width: '100%',
  },
  historyCount: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: UiRadii.pill,
    height: 28,
    justifyContent: 'center',
    minWidth: 28,
    paddingHorizontal: UiSpacing.sm,
  },
  historyCountText: {
    color: '#1A73E8',
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  subtitle: {
    color: '#5F6368',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  newChatButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#1A73E8',
    borderRadius: UiRadii.control,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    marginTop: UiSpacing.md,
    minHeight: UiControlHeights.button,
    paddingHorizontal: UiSpacing.lg,
  },
  newChatButtonText: {
    color: '#FFFFFF',
    fontSize: UiTypography.button.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.button.lineHeight,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: UiSpacing.md,
    marginTop: UiSpacing.xxl,
  },
  sectionTitle: {
    color: '#202124',
    fontSize: UiTypography.cardHeading.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.cardHeading.lineHeight,
  },
  sectionAction: {
    color: '#1A73E8',
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  disabledAction: {
    color: '#BDC1C6',
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    padding: UiSpacing.xl,
  },
  emptyTitle: {
    color: '#202124',
    fontSize: UiTypography.cardHeading.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.cardHeading.lineHeight,
    marginTop: UiSpacing.md,
  },
  emptyText: {
    color: '#5F6368',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    marginTop: UiSpacing.xs,
    maxWidth: 360,
    textAlign: 'center',
  },
  emptyCta: {
    backgroundColor: '#E8F0FE',
    borderRadius: UiRadii.control,
    justifyContent: 'center',
    marginTop: UiSpacing.lg,
    minHeight: UiControlHeights.button,
    paddingHorizontal: UiSpacing.xl,
  },
  emptyCtaText: {
    color: '#174EA6',
    fontSize: UiTypography.button.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.button.lineHeight,
  },
  chatBlock: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: UiSpacing.sm,
    overflow: 'hidden',
  },
  chatBlockPressable: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: UiSpacing.md,
    minHeight: 76,
    padding: UiSpacing.md,
  },
  deleteChatButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    width: UiControlHeights.button,
  },
  chatBlockIcon: {
    alignItems: 'center',
    backgroundColor: '#EDF4FF',
    borderRadius: UiRadii.icon,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  chatBlockBody: {
    flex: 1,
    minWidth: 0,
  },
  chatBlockTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: UiSpacing.sm,
    justifyContent: 'space-between',
  },
  chatBlockTitle: {
    color: '#202124',
    flex: 1,
    fontSize: UiTypography.body.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.body.lineHeight,
  },
  messagePill: {
    backgroundColor: '#F1F3F4',
    borderRadius: UiRadii.pill,
    paddingHorizontal: UiSpacing.sm,
    paddingVertical: UiSpacing.xxs,
  },
  messagePillText: {
    color: '#5F6368',
    fontSize: UiTypography.caption.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.caption.lineHeight,
  },
  chatBlockPreview: {
    color: '#5F6368',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    marginTop: UiSpacing.xs,
  },
  timestamp: {
    color: '#80868B',
    fontSize: UiTypography.caption.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.caption.lineHeight,
    marginTop: UiSpacing.xs,
  },
});
