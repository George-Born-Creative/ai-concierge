import EventSource from 'react-native-sse';

import { ApiError } from './api-error';
import { getApiBaseUrl } from './base-url';
import { apiRequest } from './client';
import type {
  AssistantConversation,
  AssistantConversationGroupsResponse,
  AssistantMessage,
  AssistantStreamEvent,
  RunAssistantCommandRequest,
} from './types';
import { getToken } from '../session';

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

/**
 * Streaming sibling of {@link runCommand}. Opens an SSE connection to
 * `POST /assistant/.../commands/stream` and yields events as they arrive
 * — `phase` markers, `token` deltas, and a terminal `done` event with
 * the persisted server message.
 *
 * Cancellation: pass an `AbortSignal` from the same `AbortController`
 * used elsewhere in the chat ("stop" button, conversation switch). When
 * aborted the generator returns cleanly and the underlying SSE
 * connection is closed.
 *
 * Error handling: HTTP / network errors surface by throwing from the
 * generator, so the caller's existing try/catch around `runCommand`
 * keeps working. The terminal `done` event is yielded *before* the
 * generator returns, so consumers should detect it explicitly to
 * finalise the optimistic bubble.
 */
export async function* runCommandStream(
  conversationId: string,
  body: RunAssistantCommandRequest,
  signal?: AbortSignal,
): AsyncGenerator<AssistantStreamEvent, void, void> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new ApiError(0, 'API URL is not set. For production, set EXPO_PUBLIC_API_BASE_URL.');
  }

  const url = `${baseUrl}/assistant/conversations/${conversationId}/commands/stream`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    'Cache-Control': 'no-cache',
  };
  const authToken = getToken();
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  // pollingInterval=0 disables react-native-sse's auto-reconnect so the
  // stream ends cleanly the moment the server closes (post-`done`),
  // instead of looping a re-POST every 5s.
  const es = new EventSource(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    pollingInterval: 0,
  });

  type QueueEntry =
    | { kind: 'event'; value: AssistantStreamEvent }
    | { kind: 'error'; error: Error }
    | { kind: 'close' };

  const queue: QueueEntry[] = [];
  let waiter: ((entry: QueueEntry) => void) | null = null;
  const push = (entry: QueueEntry) => {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w(entry);
    } else {
      queue.push(entry);
    }
  };
  const dequeue = (): Promise<QueueEntry> =>
    queue.length > 0
      ? Promise.resolve(queue.shift()!)
      : new Promise((resolve) => {
          waiter = resolve;
        });

  // react-native-sse's MessageEvent.data is the SSE `data:` payload as a
  // string. The backend always emits valid JSON; tolerate transient
  // empty strings (heartbeat / keepalive) without crashing.
  const onMessage = (e: { data: string | null }) => {
    if (typeof e.data !== 'string' || e.data.length === 0) return;
    try {
      const parsed = JSON.parse(e.data) as AssistantStreamEvent;
      push({ kind: 'event', value: parsed });
    } catch (err) {
      push({ kind: 'error', error: err as Error });
    }
  };
  const onError = (e: {
    type: string;
    message?: string;
    xhrStatus?: number;
  }) => {
    const status = typeof e.xhrStatus === 'number' ? e.xhrStatus : 0;
    const msg = e.message || `SSE ${e.type}`;
    push({ kind: 'error', error: new ApiError(status, msg) });
  };

  es.addEventListener('message', onMessage);
  es.addEventListener('error', onError);

  let onAbort: (() => void) | null = null;
  if (signal) {
    if (signal.aborted) {
      es.removeAllEventListeners();
      es.close();
      return;
    }
    onAbort = () => push({ kind: 'close' });
    signal.addEventListener('abort', onAbort);
  }

  try {
    while (true) {
      const next = await dequeue();
      if (next.kind === 'close') return;
      if (next.kind === 'error') throw next.error;
      yield next.value;
      if (next.value.type === 'done') return;
    }
  } finally {
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
    es.removeAllEventListeners();
    es.close();
  }
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
