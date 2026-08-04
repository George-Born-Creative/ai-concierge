import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { updateConversation } from '@/lib/api/ghl';
import type { GhlConversationSummary } from '@/lib/api/types';
import { useAppTheme } from '@/lib/theme/theme-provider';

// Channel → icon mapping.
const CHANNEL_ICONS: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  sms: 'sms',
  email: 'email',
  whatsapp: 'chat',
  facebook: 'facebook',
  instagram: 'photo-camera',
  live_chat: 'chat-bubble',
};

function channelIcon(channel?: string): keyof typeof MaterialIcons.glyphMap {
  if (!channel) return 'chat-bubble-outline';
  return CHANNEL_ICONS[channel.toLowerCase()] ?? 'chat-bubble-outline';
}

/** Human-friendly relative time label. */
function relativeTime(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Derive initials from a contact name for an avatar circle. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name[0] ?? '?').toUpperCase();
}

type Props = {
  item: GhlConversationSummary;
  onPress: () => void;
  onStarToggle: (id: string, newStarred: boolean) => void;
};

export function ConversationListItem({ item, onPress, onStarToggle }: Props) {
  const { colors } = useAppTheme();
  const isUnread = item.unreadCount > 0;

  async function handleStar() {
    const newStarred = !(item.starred ?? false);
    onStarToggle(item.id, newStarred);
    try {
      await updateConversation(item.id, { starred: newStarred });
    } catch {
      // Revert on failure.
      onStarToggle(item.id, !newStarred);
    }
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && { opacity: 0.7 },
      ]}>
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: colors.primary + '22' }]}>
        <Text style={[styles.avatarText, { color: colors.primary }]}>
          {initials(item.contactName)}
        </Text>
      </View>

      {/* Content */}
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.nameRow}>
            <MaterialIcons
              name={channelIcon(item.channel)}
              size={14}
              color={colors.textMuted}
              style={styles.channelIcon}
            />
            <Text
              style={[
                styles.contactName,
                { color: colors.textPrimary },
                isUnread && styles.unreadName,
              ]}
              numberOfLines={1}>
              {item.contactName}
            </Text>
          </View>
          <Text style={[styles.time, { color: colors.textMuted }]}>
            {relativeTime(item.lastMessageAt)}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          <Text
            style={[
              styles.preview,
              { color: isUnread ? colors.textPrimary : colors.textMuted },
              isUnread && styles.unreadPreview,
            ]}
            numberOfLines={2}>
            {item.lastMessageBody || 'No message content'}
          </Text>

          <View style={styles.badges}>
            {isUnread && (
              <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
              </View>
            )}
            <Pressable onPress={handleStar} hitSlop={8}>
              <MaterialIcons
                name={item.starred ? 'star' : 'star-border'}
                size={20}
                color={item.starred ? '#FBBC04' : colors.textMuted}
              />
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 10,
    padding: 14,
  },
  avatar: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    marginRight: 12,
    width: 40,
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
  },
  body: {
    flex: 1,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  nameRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    marginRight: 8,
  },
  channelIcon: {
    marginRight: 4,
  },
  contactName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  unreadName: {
    fontWeight: '700',
  },
  time: {
    fontSize: 12,
  },
  bottomRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  preview: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    marginRight: 8,
  },
  unreadPreview: {
    fontWeight: '600',
  },
  badges: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  unreadBadge: {
    alignItems: 'center',
    borderRadius: 12,
    height: 22,
    justifyContent: 'center',
    minWidth: 22,
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
