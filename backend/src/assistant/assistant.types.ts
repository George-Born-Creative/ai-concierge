export type AssistantSessionContext = {
  lastContactId?: string;
  lastContactName?: string;
  lastCalendarId?: string;
  lastCalendarName?: string;
  lastAppointmentId?: string;
  lastAppointmentTitle?: string;
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
