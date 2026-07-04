export type PendingIntent = {
  /** Intent name, e.g. "create_opportunity". */
  intent: string;
  /** Entities collected so far (camelCase as the executor expects them). */
  entities: Record<string, string | number | boolean | null>;
  /** Ordered list of field keys still needed before the executor can run. */
  missing: string[];
  /** The last question we asked the user — used so the LLM/UI can re-show context. */
  question: string;
  /** ISO 8601 expiry. After this the pending intent is dropped. */
  expiresAt: string;
};

export type AssistantSessionContext = {
  lastContactId?: string;
  lastContactName?: string;
  lastCalendarId?: string;
  lastCalendarName?: string;
  lastAppointmentId?: string;
  lastAppointmentTitle?: string;
  lastOpportunityId?: string;
  lastOpportunityName?: string;
  lastPipelineId?: string;
  lastPipelineName?: string;
  lastPipelineStageId?: string;
  lastCompanyId?: string;
  lastCompanyName?: string;
  lastTicketId?: string;
  lastTicketSubject?: string;
  /** Multi-turn task state; null clears it. */
  pendingIntent?: PendingIntent | null;
};

export type AssistantCommandStatus = 'success' | 'error';

export type AssistantCommandResult = {
  response: string;
  status: AssistantCommandStatus;
  intent?: {
    intent: string;
    confidence: number;
    entities: Record<string, string | number | boolean | null>;
    needs_clarification: boolean;
    notes: string | null;
  };
  contextPatch?: AssistantSessionContext;
  /** Set when the executor still needs more information from the user. */
  pendingIntent?: PendingIntent;
  /** Set to true when the executor explicitly cleared an in-flight task. */
  clearPendingIntent?: boolean;
  /**
   * Set to true when the result should NOT auto-clear an existing pending
   * task on success (used by conversational tangent replies — the user asked
   * a question mid-flow but didn't abandon the workflow).
   */
  preservePendingIntent?: boolean;
};

export type ConversationHistoryTurn = {
  command: string;
  response: string;
};

export type VoiceIntentPayload = {
  intent: string;
  confidence: number;
  entities: Record<string, string | number | boolean | null>;
  needs_clarification: boolean;
  notes: string | null;
};
