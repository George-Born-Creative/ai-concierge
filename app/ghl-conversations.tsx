import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import {
  UiControlHeights,
  UiRadii,
  UiSpacing,
  UiTypography,
} from '@/constants/theme';
import { listConversations } from '@/lib/api/ghl';
import {
  getCachedConversations,
  setCachedConversations,
} from '@/lib/api/ghl-conversation-cache';
import type { GhlConversationSummary } from '@/lib/api/types';
import { useAppTheme } from '@/lib/theme/theme-provider';

export default function GhlConversationsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [conversations, setConversations] = useState<GhlConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConversations = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const res = await listConversations({ limit: 50 });
      setConversations(res.conversations);
      setCachedConversations(res.conversations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const cached = getCachedConversations();
    if (cached) {
      setConversations(cached);
      setLoading(false);
    } else {
      fetchConversations();
    }
  }, [fetchConversations]);

  function renderItem({ item }: { item: GhlConversationSummary }) {
    const isUnread = item.unreadCount > 0;
    
    return (
      <Pressable
        onPress={() => router.push({ pathname: '/ghl-conversation/[id]', params: { id: item.id } })}
        style={({ pressed }) => [
          styles.item,
          { backgroundColor: colors.surface },
          pressed && { opacity: 0.7 },
        ]}>
        <View style={styles.itemHeader}>
          <Text style={[styles.contactName, { color: colors.textPrimary }, isUnread && styles.unreadText]}>
            {item.contactName}
          </Text>
          {item.lastMessageAt && (
            <Text style={[styles.dateText, { color: colors.textMuted }]}>
              {new Date(item.lastMessageAt).toLocaleDateString()}
            </Text>
          )}
        </View>
        <View style={styles.itemBody}>
          <Text
            style={[styles.messagePreview, { color: isUnread ? colors.textPrimary : colors.textMuted }]}
            numberOfLines={2}>
            {item.lastMessageBody || 'No message content'}
          </Text>
          {isUnread && (
            <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  }

  return (
    <ScreenShell>
      <PageHeader
        title="Inbox"
        showBack
        onBack={() => router.back()}
        right={
          <Pressable onPress={() => fetchConversations(true)} hitSlop={8}>
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
          <Pressable onPress={() => fetchConversations(true)} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onRefresh={() => fetchConversations(true)}
          refreshing={refreshing}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No conversations found.
            </Text>
          }
        />
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
  listContent: {
    alignSelf: 'center',
    maxWidth: 720,
    padding: UiSpacing.lg,
    width: '100%',
  },
  item: {
    borderRadius: UiRadii.card,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: UiSpacing.sm,
    padding: UiSpacing.md,
  },
  itemHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: UiSpacing.xs,
  },
  contactName: {
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '500',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  unreadText: {
    fontWeight: '700',
  },
  dateText: {
    fontSize: UiTypography.caption.fontSize,
    lineHeight: UiTypography.caption.lineHeight,
  },
  itemBody: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  messagePreview: {
    flex: 1,
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
    marginRight: UiSpacing.md,
  },
  unreadBadge: {
    alignItems: 'center',
    borderRadius: UiRadii.pill,
    height: 24,
    justifyContent: 'center',
    minWidth: 24,
    paddingHorizontal: UiSpacing.xs,
  },
  unreadBadgeText: {
    color: '#FFF',
    fontSize: UiTypography.label.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.label.lineHeight,
  },
  emptyText: {
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
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
});
