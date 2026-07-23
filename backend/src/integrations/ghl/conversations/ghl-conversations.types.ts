export type GhlConversationSummary = {
  id: string;
  contactId: string;
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  channel?: string;
  lastMessageBody?: string;
  lastMessageDirection?: 'inbound' | 'outbound';
  lastMessageAt?: string;
  unreadCount: number;
  starred?: boolean;
};

export type GhlMessageSummary = {
  id: string;
  conversationId: string;
  contactId?: string;
  direction: 'inbound' | 'outbound';
  type: string;
  body?: string;
  subject?: string;
  status?: string;
  attachments: string[];
  createdAt?: string;
};

export type GhlConversationsListResult = {
  conversations: GhlConversationSummary[];
  meta?: {
    total?: number;
  };
};

export type GhlConversationMessagesListResult = {
  messages: GhlMessageSummary[];
  meta?: {
    total?: number;
    nextPageUrl?: string | null;
    startAfterId?: string | null;
  };
};
