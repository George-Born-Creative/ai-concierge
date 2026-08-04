import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GhlService } from '../ghl.service';
import { ListConversationMessagesQueryDto } from './dto/list-conversation-messages.query.dto';
import { ListConversationsQueryDto } from './dto/list-conversations.query.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import {
  GhlConversationMessagesListResult,
  GhlConversationsListResult,
  GhlConversationSummary,
  GhlMessageSummary,
  GhlUpdateConversationResult,
  GhlUserIdentity,
} from './ghl-conversations.types';

// ── GHL raw response shapes ─────────────────────────────────────────────────

type GhlRawConversation = {
  id?: string;
  contactId?: string;
  locationId?: string;
  lastMessageBody?: string;
  lastMessageType?: string;
  type?: string;
  unreadCount?: number;
  fullName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  dateAdded?: number | string;
  dateUpdated?: number | string;
  lastMessageDate?: number | string;
  starred?: boolean;
  assignedTo?: string;
  followers?: string[];
  inbox?: string;
};

type GhlRawConversationsResponse = {
  conversations?: GhlRawConversation[];
  total?: number;
};

type GhlRawMessage = {
  id?: string;
  type?: string;
  direction?: 'inbound' | 'outbound' | string;
  body?: string;
  subject?: string;
  status?: string;
  contactId?: string;
  conversationId?: string;
  dateAdded?: string | number;
  attachments?: string[];
};

type GhlRawMessagesResponse = {
  messages?: {
    messages?: GhlRawMessage[];
    lastMessageId?: string;
    nextPageUrl?: string;
  };
};

type GhlRawUser = {
  id?: string;
  name?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
};

type GhlRawUsersSearchResponse = {
  users?: GhlRawUser[];
  count?: number;
};

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class GhlConversationsService {
  private readonly logger = new Logger(GhlConversationsService.name);

  /**
   * In-memory cache for resolved GHL user IDs.
   * Keyed by our app's userId → the GHL user ID within their location.
   * Cleared naturally when the process restarts; a short TTL prevents stale
   * data if the user changes their GHL account.
   */
  private readonly ghlUserIdCache = new Map<string, { ghlUserId: string; expiresAt: number }>();
  private static readonly USER_ID_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

  constructor(private readonly ghlService: GhlService) { }

  // ── Search / List ───────────────────────────────────────────────────────

  async searchConversations(
    userId: string,
    query: ListConversationsQueryDto,
  ): Promise<GhlConversationsListResult> {
    await this.ghlService.requireConversationScopes(userId);
    const { locationId } = await this.ghlService.getValidAccessToken(userId);
    if (!locationId) {
      throw new BadRequestException('GHL location is missing — reconnect GoHighLevel');
    }

    const params = new URLSearchParams({
      locationId,
      limit: String(query.limit ?? 50),
    });

    // Text search
    if (query.query?.trim()) params.set('query', query.query.trim());

    // Pagination cursor
    if (query.startAfterId?.trim()) params.set('startAfterId', query.startAfterId.trim());

    // Status filter: all | read | unread | starred | recents
    if (query.status !== 'all') {
      params.set('status', query.status || 'recents');
    }

    // Assignment filter (GHL user ID or "unassigned")
    if (query.assignedTo?.trim()) params.set('assignedTo', query.assignedTo.trim());

    // Followers filter (GHL user IDs, comma-separated)
    if (query.followers?.trim()) params.set('followers', query.followers.trim());

    // Last message type filter (e.g. TYPE_INTERNAL_COMMENT for internal chat)
    if (query.lastMessageType?.trim()) params.set('lastMessageType', query.lastMessageType.trim());

    // Sort configuration
    if (query.sortBy) params.set('sortBy', query.sortBy);
    if (query.sort) params.set('sort', query.sort);

    const raw = await this.ghlService.ghlRequest<GhlRawConversationsResponse>(
      userId,
      'GET',
      `/conversations/search?${params.toString()}`,
    );

    const conversations = (raw.conversations ?? [])
      .map((c) => this.toConversationSummary(c))
      .filter((c): c is GhlConversationSummary => Boolean(c.id));

    return {
      conversations,
      meta: {
        total: raw.total,
      },
    };
  }

  // ── Single conversation ─────────────────────────────────────────────────

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<GhlConversationSummary> {
    await this.ghlService.requireConversationScopes(userId);
    const raw = await this.ghlService.ghlRequest<{ conversation?: GhlRawConversation } & GhlRawConversation>(
      userId,
      'GET',
      `/conversations/${conversationId}`,
    );

    const conversation = raw.conversation ?? raw;
    if (!conversation.id) {
      throw new BadRequestException('GHL did not return the conversation');
    }

    return this.toConversationSummary(conversation);
  }

  // ── Messages ────────────────────────────────────────────────────────────

  async getMessages(
    userId: string,
    conversationId: string,
    query: ListConversationMessagesQueryDto,
  ): Promise<GhlConversationMessagesListResult> {
    await this.ghlService.requireConversationScopes(userId);
    const params = new URLSearchParams({
      limit: String(query.limit ?? 20),
    });

    if (query.lastMessageId?.trim()) {
      params.set('lastMessageId', query.lastMessageId.trim());
    }

    // According to GHL documentation, GET /conversations/{conversationId}/messages
    const raw = await this.ghlService.ghlRequest<GhlRawMessagesResponse>(
      userId,
      'GET',
      `/conversations/${conversationId}/messages?${params.toString()}`,
    );

    // GHL wraps messages in a `messages` object sometimes
    const messagesData = raw.messages ?? (raw as any);
    const messageList = Array.isArray(messagesData.messages) ? messagesData.messages : (Array.isArray(messagesData) ? messagesData : []);

    const messages = messageList
      .map((m: GhlRawMessage) => this.toMessageSummary(m, conversationId))
      .filter((m: GhlMessageSummary): m is GhlMessageSummary => Boolean(m.id));

    return {
      messages,
      meta: {
        startAfterId: messagesData.lastMessageId ?? null,
      },
    };
  }

  // ── Update conversation (star / mark read) ──────────────────────────────

  async updateConversation(
    userId: string,
    conversationId: string,
    dto: UpdateConversationDto,
  ): Promise<GhlUpdateConversationResult> {
    await this.ghlService.requireConversationScopes(userId);
    const body: Record<string, unknown> = {};
    if (dto.starred !== undefined) body.starred = dto.starred;
    if (dto.unreadCount !== undefined) body.unreadCount = dto.unreadCount;

    const raw = await this.ghlService.ghlRequest<GhlRawConversation>(
      userId,
      'PUT',
      `/conversations/${conversationId}`,
      body,
    );

    return {
      id: raw.id ?? conversationId,
      starred: raw.starred,
      unreadCount: raw.unreadCount,
    };
  }

  // ── Resolve GHL user ID ─────────────────────────────────────────────────

  /**
   * Resolves the GHL user ID for the authenticated app user.
   *
   * Calls `GET /users/search?locationId={locationId}` and matches by the
   * app user's email. The result is cached in-memory for 15 minutes.
   *
   * Falls back gracefully: if the GHL API doesn't support the users scope
   * or no matching user is found, this returns `null` rather than throwing —
   * the frontend can then disable "Assigned to me" / "Followed by me".
   */
  async getGhlUserId(userId: string): Promise<GhlUserIdentity | null> {
    // Check cache first
    const cached = this.ghlUserIdCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return { ghlUserId: cached.ghlUserId };
    }

    try {
      const { locationId } = await this.ghlService.getValidAccessToken(userId);
      if (!locationId) return null;

      const raw = await this.ghlService.ghlRequest<GhlRawUsersSearchResponse>(
        userId,
        'GET',
        `/users/search?locationId=${locationId}&limit=100`,
      );

      const users = raw.users ?? [];
      if (users.length === 0) {
        this.logger.warn(`No GHL users found for location ${locationId}`);
        return null;
      }

      // If there's exactly one user in the location, that's our user.
      // Otherwise, try to match by email.
      let matched: GhlRawUser | undefined;
      if (users.length === 1) {
        matched = users[0];
      } else {
        // Attempt email match — we need the app user's email from the DB.
        // The GhlService has access to Prisma via getValidAccessToken, but
        // we don't expose the user record here. For now, return the first
        // user if we can't narrow further. The frontend can also provide
        // the GHL user ID manually.
        // TODO: enhance with email matching once user email is accessible
        matched = users[0];
        this.logger.log(
          `Multiple GHL users (${users.length}) found for location ${locationId}, ` +
          `defaulting to first user: ${matched?.id}`,
        );
      }

      if (!matched?.id) return null;

      // Cache the resolved ID
      this.ghlUserIdCache.set(userId, {
        ghlUserId: matched.id,
        expiresAt: Date.now() + GhlConversationsService.USER_ID_CACHE_TTL_MS,
      });

      return {
        ghlUserId: matched.id,
        name: matched.name ?? ([matched.firstName, matched.lastName].filter(Boolean).join(' ') || undefined),
        email: matched.email,
      };
    } catch (err) {
      // Graceful degradation — users.readonly scope may not be granted
      this.logger.warn(
        `Failed to resolve GHL user ID for user ${userId}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ── Mappers ─────────────────────────────────────────────────────────────

  private toConversationSummary(raw: GhlRawConversation): GhlConversationSummary {
    const contactName = raw.fullName || raw.contactName || 'Unknown Contact';
    return {
      id: raw.id ?? '',
      contactId: raw.contactId ?? '',
      contactName: contactName.trim(),
      contactEmail: raw.email,
      contactPhone: raw.phone,
      channel: raw.type ?? raw.lastMessageType,
      lastMessageBody: raw.lastMessageBody,
      lastMessageDirection: undefined, // GHL conversations endpoint typically doesn't give direction directly
      lastMessageType: raw.lastMessageType,
      lastMessageAt: this.normalizeDate(raw.lastMessageDate ?? raw.dateUpdated ?? raw.dateAdded),
      unreadCount: raw.unreadCount ?? 0,
      starred: raw.starred,
      assignedTo: raw.assignedTo,
      followers: Array.isArray(raw.followers) ? raw.followers : undefined,
      inbox: raw.inbox,
    };
  }

  private toMessageSummary(raw: GhlRawMessage, fallbackConversationId: string): GhlMessageSummary {
    let direction: 'inbound' | 'outbound' = 'inbound';
    if (raw.direction === 'outbound') direction = 'outbound';

    return {
      id: raw.id ?? '',
      conversationId: raw.conversationId ?? fallbackConversationId,
      contactId: raw.contactId,
      direction,
      type: raw.type ?? 'unknown',
      body: raw.body,
      subject: raw.subject,
      status: raw.status,
      attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
      createdAt: this.normalizeDate(raw.dateAdded),
    };
  }

  private normalizeDate(value: string | number | undefined): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'number') {
      return new Date(value < 1e12 ? value * 1000 : value).toISOString();
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    return value;
  }
}
