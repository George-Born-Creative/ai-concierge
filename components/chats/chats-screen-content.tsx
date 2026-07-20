import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PageHeader } from '@/components/page-header';
import { ScreenShell } from '@/components/screen';
import { Skeleton, SkeletonLines } from '@/components/ui/skeleton';
import {
  useAssistantHistory,
  type AssistantChat,
  type AssistantChatGroup,
} from '@/lib/assistant-history';
import { useAppTheme } from '@/lib/theme/theme-provider';

type Section = {
  key: AssistantChatGroup['key'];
  label: string;
  data: AssistantChat[];
};

export function ChatsScreenContent() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const {
    chats,
    chatGroups,
    loading,
    refreshChats,
    deleteChat,
    clearAllChats,
  } = useAssistantHistory();

  // Re-fetch the grouped list every time the user lands on this screen so
  // newly-touched chats float into the right bucket.
  useFocusEffect(
    useCallback(() => {
      void refreshChats();
    }, [refreshChats]),
  );

  const sections: Section[] = chatGroups
    .map((group) => {
      const data = group.conversationIds
        .map((id) => chats.find((c) => c.id === id))
        .filter((c): c is AssistantChat => Boolean(c));
      return { key: group.key, label: group.label, data };
    })
    .filter((s) => s.data.length > 0);

  const totalChats = sections.reduce((acc, s) => acc + s.data.length, 0);

  function handleOpen(chatId: string) {
    router.push({ pathname: '/(chat)/chat', params: { conversationId: chatId } });
  }

  function handleDelete(chat: AssistantChat) {
    Alert.alert(
      'Delete chat?',
      chat.title || chat.preview || 'This will remove this conversation and its messages.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void deleteChat(chat.id),
        },
      ],
    );
  }

  function handleClearAll() {
    Alert.alert('Clear all chats?', 'This permanently removes every chat and its history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => void clearAllChats(),
      },
    ]);
  }

  return (
    <ScreenShell edges={['bottom']}>
      <PageHeader
        title="Chats"
        showBack
        onBack={() => router.back()}
        right={
          totalChats > 0 ? (
            <Pressable onPress={handleClearAll} hitSlop={8}>
              <Text style={styles.clearAll}>Clear</Text>
            </Pressable>
          ) : null
        }
      />

      {loading && totalChats === 0 ? (
        <ChatsSkeleton />
      ) : totalChats === 0 ? (
        <EmptyState onStart={() => router.push('/(chat)/chat')} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => void refreshChats()}
            tintColor={colors.primary}
            />
          }
          contentContainerStyle={styles.listContent}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.label.toUpperCase()}</Text>
          )}
          renderItem={({ item, index, section }) => (
            <ChatRow
              chat={item}
              isFirst={index === 0}
              isLast={index === section.data.length - 1}
              onOpen={() => handleOpen(item.id)}
              onDelete={() => handleDelete(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
        />
      )}
    </ScreenShell>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function ChatRow({
  chat,
  isFirst,
  isLast,
  onOpen,
  onDelete,
}: {
  chat: AssistantChat;
  isFirst: boolean;
  isLast: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { colors } = useAppTheme();
  const time = formatTime(chat.updatedAt);
  const status = chat.lastStatus ?? 'success';
  const source = chat.lastSource ?? 'text';
  const title = chat.title?.trim() || (chat.preview ?? '').trim() || 'New chat';
  const subtitle = chat.preview && chat.preview !== title ? chat.preview : null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        isFirst && styles.rowTop,
        isLast && styles.rowBottom,
        pressed && styles.rowPressed,
      ]}
      onPress={onOpen}
      onLongPress={onDelete}
      delayLongPress={400}>
      <View style={styles.rowIcon}>
        <MaterialIcons
          name={source === 'voice' ? 'mic' : 'chat-bubble-outline'}
          size={18}
          color={colors.primary}
        />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        <View style={styles.rowMetaRow}>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {time}
            {chat.messageCount && chat.messageCount > 0
              ? ` · ${chat.messageCount} ${chat.messageCount === 1 ? 'message' : 'messages'}`
              : ''}
          </Text>
          <StatusBadge status={status} />
        </View>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={colors.iconMuted} />
    </Pressable>
  );
}

function StatusBadge({ status }: { status: 'success' | 'error' | 'pending' }) {
  const { colors } = useAppTheme();
  if (status === 'pending') {
    return (
      <View style={[styles.statusDot, { backgroundColor: colors.primary }]} />
    );
  }
  if (status === 'error') {
    return <View style={[styles.statusDot, { backgroundColor: colors.danger }]} />;
  }
  return <View style={[styles.statusDot, { backgroundColor: colors.success }]} />;
}

function EmptyState({ onStart }: { onStart: () => void }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <MaterialIcons name="chat-bubble-outline" size={28} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>No chats yet</Text>
      <Text style={styles.emptyText}>
        Start a new chat to ask the assistant about contacts, calendars, or opportunities.
      </Text>
      <Pressable style={styles.startButton} onPress={onStart}>
        <Text style={styles.startButtonText}>Start a chat</Text>
      </Pressable>
    </View>
  );
}

function ChatsSkeleton() {
  return (
    <View style={styles.listContent}>
      {[0, 1].map((s) => (
        <View key={s} style={{ marginBottom: 18 }}>
          <Skeleton width={120} height={11} radius={6} style={{ marginLeft: 4, marginBottom: 10 }} />
          <View style={styles.skeletonGroup}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.row, i === 0 && styles.rowTop, i === 2 && styles.rowBottom]}>
                <View style={styles.rowIcon}>
                  <Skeleton width={18} height={18} radius={6} />
                </View>
                <View style={styles.rowCopy}>
                  <Skeleton width="55%" height={14} radius={6} />
                  <SkeletonLines lines={1} lineHeight={11} gap={6} lastLineWidth="80%" />
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  clearAll: {
    color: '#EA4335',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeader: {
    color: '#80868B',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    marginBottom: 8,
    marginLeft: 4,
    marginTop: 18,
  },
  row: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowTop: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  rowBottom: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  rowPressed: {
    backgroundColor: '#F6F8FB',
  },
  rowIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 10,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: '#202124',
    fontSize: 15,
    fontWeight: '600',
  },
  rowSubtitle: {
    color: '#5F6368',
    fontSize: 13,
    lineHeight: 18,
  },
  rowMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  rowMeta: {
    color: '#80868B',
    flex: 1,
    fontSize: 12,
  },
  statusDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  divider: {
    backgroundColor: '#EEF0F3',
    height: 1,
    marginLeft: 60,
  },
  empty: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 32,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 30,
    height: 60,
    justifyContent: 'center',
    marginBottom: 18,
    width: 60,
  },
  emptyTitle: {
    color: '#202124',
    fontSize: 20,
    fontWeight: '600',
  },
  emptyText: {
    color: '#5F6368',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    maxWidth: 300,
    textAlign: 'center',
  },
  startButton: {
    backgroundColor: '#1A73E8',
    borderRadius: 14,
    marginTop: 22,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  skeletonGroup: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
  },
});
