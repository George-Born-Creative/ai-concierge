import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GhlService } from '../ghl.service';
import {
  GhlConversationMessagesListResult,
  GhlConversationsListResult,
  GhlConversationSummary,
  GhlMessageSummary,
} from './ghl-conversations.types';
import { ListConversationsQueryDto } from './dto/list-conversations.query.dto';
import { ListConversationMessagesQueryDto } from './dto/list-conversation-messages.query.dto';

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

@Injectable()
export class GhlConversationsService {
  private readonly logger = new Logger(GhlConversationsService.name);

  constructor(private readonly ghlService: GhlService) {}

  async searchConversations(
    userId: string,
    query: ListConversationsQueryDto,
  ): Promise<GhlConversationsListResult> {
    const { locationId } = await this.ghlService.getValidAccessToken(userId);
    if (!locationId) {
      throw new BadRequestException('GHL location is missing — reconnect GoHighLevel');
    }

    const params = new URLSearchParams({
      locationId,
      limit: String(query.limit ?? 20),
    });

    if (query.query?.trim()) params.set('query', query.query.trim());
    if (query.startAfterId?.trim()) params.set('startAfterId', query.startAfterId.trim());
    if (query.unreadOnly) params.set('status', 'unread');

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

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<GhlConversationSummary> {
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

  async getMessages(
    userId: string,
    conversationId: string,
    query: ListConversationMessagesQueryDto,
  ): Promise<GhlConversationMessagesListResult> {
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
      lastMessageAt: this.normalizeDate(raw.lastMessageDate ?? raw.dateUpdated ?? raw.dateAdded),
      unreadCount: raw.unreadCount ?? 0,
      starred: raw.starred,
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
