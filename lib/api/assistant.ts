import { apiRequest } from './client';
import type {
  AssistantConversation,
  AssistantConversationGroupsResponse,
  AssistantMessage,
  RunAssistantCommandRequest,
} from './types';

export async function listConversations(
  timeZone?: string,
): Promise<AssistantConversationGroupsResponse> {
  const tz = timeZone ?? safeLocalTimeZone();
  const path = tz
    ? `/assistant/conversations?tz=${encodeURIComponent(tz)}`
    : '/assistant/conversations';
  return apiRequest<AssistantConversationGroupsResponse>(path);
}

function safeLocalTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export async function createConversation(): Promise<AssistantConversation> {
  return apiRequest<AssistantConversation>('/assistant/conversations', { method: 'POST' });
}

export async function getConversation(id: string): Promise<AssistantConversation> {
  return apiRequest<AssistantConversation>(`/assistant/conversations/${id}`);
}

export async function deleteConversation(id: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>(`/assistant/conversations/${id}`, { method: 'DELETE' });
}

export async function clearConversations(): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>('/assistant/conversations', { method: 'DELETE' });
}

export async function runCommand(
  conversationId: string,
  body: RunAssistantCommandRequest,
): Promise<AssistantMessage> {
  return apiRequest<AssistantMessage>(`/assistant/conversations/${conversationId}/commands`, {
    method: 'POST',
    body,
  });
}

export async function deleteMessage(
  conversationId: string,
  messageId: string,
): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>(
    `/assistant/conversations/${conversationId}/messages/${messageId}`,
    { method: 'DELETE' },
  );
}
