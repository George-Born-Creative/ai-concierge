export type GhlConversationSummary = {
  id: string;
  contactId: string;
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  channel?: string;
  lastMessageBody?: string;
  lastMessageDirection?: 'inbound' | 'outbound';
  lastMessageType?: string;
  lastMessageAt?: string;
  unreadCount: number;
  starred?: boolean;
  /** GHL user ID this conversation is assigned to. */
  assignedTo?: string;
  /** GHL user IDs following this conversation. */
  followers?: string[];
  /** Inbox type (e.g. from the GHL conversation object). */
  inbox?: string;
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

/** Shape returned by the update-conversation endpoint. */
export type GhlUpdateConversationResult = {
  id: string;
  starred?: boolean;
  unreadCount?: number;
};

/** Resolved GHL user identity for the authenticated app user. */
export type GhlUserIdentity = {
  ghlUserId: string;
  name?: string;
  email?: string;
};
