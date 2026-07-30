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
import { PageSkeleton } from '@/components/ui/page-skeleton';
import {
  UiControlHeights,
  UiRadii,
  UiSpacing,
  UiTypography,
} from '@/constants/theme';
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

  if (loading && totalChats === 0) {
    return <PageSkeleton title="Chats" />;
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

      {totalChats === 0 ? (
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
    alignSelf: 'center',
    maxWidth: 720,
    paddingBottom: UiSpacing.xxl,
    paddingHorizontal: UiSpacing.lg,
    paddingTop: UiSpacing.md,
    width: '100%',
  },
  clearAll: {
    color: '#EA4335',
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  sectionHeader: {
    color: '#80868B',
    fontSize: UiTypography.caption.fontSize,
    fontWeight: '700',
    letterSpacing: 1.1,
    lineHeight: UiTypography.caption.lineHeight,
    marginBottom: UiSpacing.sm,
    marginLeft: UiSpacing.xxs,
    marginTop: UiSpacing.lg,
  },
  row: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    gap: UiSpacing.md,
    minHeight: 64,
    paddingHorizontal: UiSpacing.md,
    paddingVertical: UiSpacing.sm,
  },
  rowTop: {
    borderTopLeftRadius: UiRadii.card,
    borderTopRightRadius: UiRadii.card,
  },
  rowBottom: {
    borderBottomLeftRadius: UiRadii.card,
    borderBottomRightRadius: UiRadii.card,
  },
  rowPressed: {
    backgroundColor: '#F6F8FB',
  },
  rowIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: UiRadii.icon,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  rowCopy: {
    flex: 1,
    gap: UiSpacing.xxs,
  },
  rowTitle: {
    color: '#202124',
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  rowSubtitle: {
    color: '#5F6368',
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
  },
  rowMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: UiSpacing.sm,
    marginTop: UiSpacing.xxs,
  },
  rowMeta: {
    color: '#80868B',
    flex: 1,
    fontSize: UiTypography.caption.fontSize,
    lineHeight: UiTypography.caption.lineHeight,
  },
  statusDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  divider: {
    backgroundColor: '#EEF0F3',
    height: 1,
    marginLeft: 56,
  },
  empty: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: UiSpacing.xxxl,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: UiRadii.pill,
    height: 48,
    justifyContent: 'center',
    marginBottom: UiSpacing.lg,
    width: 48,
  },
  emptyTitle: {
    color: '#202124',
    fontSize: UiTypography.cardHeading.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.cardHeading.lineHeight,
  },
  emptyText: {
    color: '#5F6368',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    marginTop: UiSpacing.sm,
    maxWidth: 300,
    textAlign: 'center',
  },
  startButton: {
    backgroundColor: '#1A73E8',
    borderRadius: UiRadii.control,
    justifyContent: 'center',
    marginTop: UiSpacing.xl,
    minHeight: UiControlHeights.button,
    paddingHorizontal: UiSpacing.xl,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: UiTypography.button.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.button.lineHeight,
  },
  skeletonGroup: {
    backgroundColor: '#FFFFFF',
    borderRadius: UiRadii.card,
    overflow: 'hidden',
  },
});
