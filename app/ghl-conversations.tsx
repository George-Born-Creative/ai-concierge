import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ConversationFilterChips, type FilterKey } from '@/components/ghl/conversation-filter-chips';
import { ConversationListItem } from '@/components/ghl/conversation-list-item';
import { ConversationSectionTabs, type SectionKey } from '@/components/ghl/conversation-section-tabs';
import { MyInboxSubSelector, type MyInboxSub } from '@/components/ghl/my-inbox-sub-selector';
import { PageHeader } from '@/components/page-header';
import { ScreenShell } from '@/components/screen';
import {
  UiControlHeights,
  UiRadii,
  UiSpacing,
  UiTypography,
} from '@/constants/theme';
import { getGhlUserId, listConversations } from '@/lib/api/ghl';
import {
  getCachedConversations,
  setCachedConversations,
} from '@/lib/api/ghl-conversation-cache';
import type { GhlConversationSummary, ListGhlConversationsParams } from '@/lib/api/types';
import { useAppTheme } from '@/lib/theme/theme-provider';

// ─── Cache key helper ────────────────────────────────────────────────────────
function cacheKey(section: SectionKey, sub: MyInboxSub, filter: FilterKey): string {
  return `${section}:${sub}:${filter}`;
}

export default function GhlConversationsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();

  // ─── UI state ────────────────────────────────────────────────────────────
  const [section, setSection] = useState<SectionKey>('my-inbox');
  const [myInboxSub, setMyInboxSub] = useState<MyInboxSub>('all');
  const [filter, setFilter] = useState<FilterKey>('all');

  // ─── Data state ──────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<GhlConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ─── GHL user id (for "assigned to me" / "followed by me") ───────────────
  const [ghlUserId, setGhlUserId] = useState<string | null>(null);

  useEffect(() => {
    getGhlUserId()
      .then((id) => setGhlUserId(id))
      .catch(() => {
        // Non-fatal: My Inbox → Assigned/Followed will fall back to showing all.
      });
  }, []);

  // ─── Build API params from current UI state ──────────────────────────────
  const apiParams: ListGhlConversationsParams = useMemo(() => {
    const params: ListGhlConversationsParams = {
      limit: 50,
      sortBy: 'last_message_date',
      sort: 'desc',
    };

    // Filter chip → status
    if (filter !== 'all') {
      params.status = filter; // 'unread' | 'starred'
    }

    // Section-specific params
    switch (section) {
      case 'my-inbox':
        if (ghlUserId) {
          if (myInboxSub === 'assigned') {
            params.assignedTo = ghlUserId;
          } else if (myInboxSub === 'followed') {
            params.followers = ghlUserId;
          } else {
            // "all" under My Inbox — show conversations assigned to current user
            params.assignedTo = ghlUserId;
          }
        }
        break;
      case 'team':
        // Team inbox: no assignedTo filter — show all conversations
        break;
      case 'internal':
        params.lastMessageType = 'TYPE_INTERNAL_COMMENT';
        break;
    }

    return params;
  }, [section, myInboxSub, filter, ghlUserId]);

  // ─── Fetch ───────────────────────────────────────────────────────────────
  const fetchConversations = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const res = await listConversations(apiParams);
        setConversations(res.conversations);
        setCachedConversations(cacheKey(section, myInboxSub, filter), res.conversations);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load conversations');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [apiParams, section, myInboxSub, filter],
  );

  // When section/sub/filter changes, try cache first, then fetch.
  useEffect(() => {
    const key = cacheKey(section, myInboxSub, filter);
    const cached = getCachedConversations(key);
    if (cached) {
      setConversations(cached);
      setLoading(false);
      // Still fetch in the background to keep cache fresh.
      fetchConversations(true);
    } else {
      fetchConversations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, myInboxSub, filter, ghlUserId]);

  // ─── Star toggle handler ─────────────────────────────────────────────────
  function handleStarToggle(id: string, newStarred: boolean) {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, starred: newStarred } : c)),
    );
  }

  // ─── Reset filter when section changes ───────────────────────────────────
  function handleSectionChange(s: SectionKey) {
    setSection(s);
    setFilter('all');
    if (s !== 'my-inbox') setMyInboxSub('all');
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  function renderItem({ item }: { item: GhlConversationSummary }) {
    return (
      <ConversationListItem
        item={item}
        onPress={() =>
          router.push({ pathname: '/ghl-conversation/[id]', params: { id: item.id } })
        }
        onStarToggle={handleStarToggle}
      />
    );
  }

  return (
    <ScreenShell>
      <PageHeader
        title="Conversations"
        showBack
        onBack={() => router.back()}
        right={
          <Pressable onPress={() => fetchConversations(true)} hitSlop={8}>
            <MaterialIcons name="refresh" size={24} color={colors.primary} />
          </Pressable>
        }
      />

      {/* Section tabs */}
      <ConversationSectionTabs active={section} onChange={handleSectionChange} />

      {/* My Inbox sub-selector */}
      {section === 'my-inbox' && (
        <MyInboxSubSelector active={myInboxSub} onChange={setMyInboxSub} />
      )}

      {/* Filter chips */}
      <ConversationFilterChips active={filter} onChange={setFilter} section={section} />

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          <Pressable
            onPress={() => fetchConversations(true)}
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
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
            <View style={styles.emptyWrap}>
              <MaterialIcons name="inbox" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No conversations found.
              </Text>
            </View>
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
  emptyWrap: {
    alignItems: 'center',
    gap: 12,
    paddingTop: 60,
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
