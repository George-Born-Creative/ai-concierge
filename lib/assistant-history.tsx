import {
    createContext,
    PropsWithChildren,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Alert } from 'react-native';

import { assistantApi, voiceApi } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import type {
  AssistantConversationBucketKey,
  AssistantMessage,
  AssistantPhase,
  RunAssistantCommandRequest,
  VoiceIntent,
} from '@/lib/api/types';
import { getToken, subscribeSession } from '@/lib/session';

export type AssistantCommandStatus = 'success' | 'error';

export type AssistantHistoryEntry = {
  /**
   * Stable React key for the row. For locally-created entries this is the
   * optimistic id (e.g. "pending-voice-1750000000"); the server's persisted
   * message id is stored separately on `serverMessageId` so list keys stay
   * stable across the optimistic→server swap (otherwise the bubble remounts
   * and the typewriter animation never fires).
   */
  id: string;
  /** Server-assigned message id once the command has been persisted. */
  serverMessageId?: string;
  command: string;
  response: string;
  status: AssistantCommandStatus;
  createdAt: string;
  source: 'text' | 'voice';
  voiceUri?: string;
  pending?: boolean;
  transcript?: string;
  intent?: VoiceIntent;
  /**
   * Live lifecycle phase for an in-flight (pending) command, driven by the
   * SSE `phase` events. Surfaced as a status line in the pending bubble and
   * irrelevant once the reply starts streaming / settles.
   */
  phase?: AssistantPhase;
};

export type AssistantChat = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages: AssistantHistoryEntry[];
  messageCount?: number;
  preview?: string | null;
  lastStatus?: 'success' | 'error' | 'pending';
  lastSource?: 'text' | 'voice' | null;
};

export type AssistantChatGroup = {
  key: AssistantConversationBucketKey;
  label: string;
  /** Conversation ids in this bucket, ordered most-recent first. */
  conversationIds: string[];
};

type AssistantState = {
  chats: AssistantChat[];
  groups: AssistantChatGroup[];
  activeChatId: string | null;
  loading: boolean;
};

function mapMessage(message: AssistantMessage): AssistantHistoryEntry {
  return {
    id: message.id,
    serverMessageId: message.id,
    command: message.command,
    response: message.response,
    status: message.status,
    createdAt: message.createdAt,
    source: message.source,
    voiceUri: message.voiceUri,
    pending: message.pending,
    transcript: message.transcript,
    intent: message.intent,
  };
}

function mapConversation(conv: {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages: AssistantMessage[];
}): AssistantChat {
  return {
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    messages: conv.messages.map(mapMessage),
  };
}

type AssistantHistoryContextValue = {
  chats: AssistantChat[];
  chatGroups: AssistantChatGroup[];
  activeChatId: string | null;
  activeMessages: AssistantHistoryEntry[];
  loading: boolean;
  createChat: () => Promise<string>;
  openChat: (chatId: string) => void;
  loadChat: (chatId: string) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  deleteMessage: (chatId: string, messageId: string) => Promise<void>;
  clearAllChats: () => Promise<void>;
  refreshChats: () => Promise<void>;
  runCommand: (
    command: string,
    source?: AssistantHistoryEntry['source'],
    conversationId?: string,
  ) => Promise<AssistantHistoryEntry>;
  addVoiceMessage: (voiceUri: string, chatId?: string) => AssistantHistoryEntry;
  /**
   * Marks every pending message in the given chat as cancelled. The
   * underlying network request keeps running (we can't abort GHL writes
   * cleanly), but its eventual response is dropped so the UI stays as
   * "Cancelled."
   */
  cancelPendingMessages: (chatId: string) => void;
};

const AssistantHistoryContext = createContext<AssistantHistoryContextValue | null>(null);

export function AssistantHistoryProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AssistantState>({
    chats: [],
    groups: [],
    activeChatId: null,
    loading: true,
  });
  // Optimistic message ids that the user cancelled. The matching SSE
  // stream is also aborted via `pendingControllersRef`; this set is the
  // belt-and-braces guard that drops a late-arriving `done` frame in
  // case it raced past the close signal.
  const cancelledIdsRef = useRef<Set<string>>(new Set());
  // AbortController per in-flight SSE stream, keyed by optimistic id.
  // Used by `cancelPendingMessages` to tear the stream down cleanly so
  // we stop billing the user's OpenAI key the instant they hit "stop".
  const pendingControllersRef = useRef<Map<string, AbortController>>(new Map());

  const refreshChats = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setState({ chats: [], groups: [], activeChatId: null, loading: false });
      return;
    }

    try {
      const { groups } = await assistantApi.listConversations();
      // Flatten preserving group order so the existing chat-by-id lookup keeps
      // working without any callsite changes elsewhere.
      const summaries = groups.flatMap((g) => g.conversations);
      setState((s) => {
        const existing = new Map(s.chats.map((chat) => [chat.id, chat]));
        const chats: AssistantChat[] = summaries.map((summary) => {
          const prior = existing.get(summary.id);
          const base: AssistantChat = {
            id: summary.id,
            title: summary.title,
            createdAt: summary.createdAt,
            updatedAt: summary.updatedAt,
            messages: prior?.messages ?? [],
            messageCount: summary.messageCount,
            preview: summary.preview,
            lastStatus: summary.status,
            lastSource: summary.source,
          };
          if (prior && prior.messages.length > 0) {
            return { ...base, messages: prior.messages };
          }
          return base;
        });
        const chatGroups: AssistantChatGroup[] = groups.map((g) => ({
          key: g.key,
          label: g.label,
          conversationIds: g.conversations.map((c) => c.id),
        }));
        return {
          chats,
          groups: chatGroups,
          activeChatId: s.activeChatId,
          loading: false,
        };
      });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    void refreshChats();
  }, [refreshChats]);

  useEffect(() => subscribeSession(() => void refreshChats()), [refreshChats]);

  const activeMessages = useMemo(() => {
    const chat = state.chats.find((c) => c.id === state.activeChatId);
    return chat?.messages ?? [];
  }, [state.chats, state.activeChatId]);

  const upsertChat = useCallback((chat: AssistantChat) => {
    setState((s) => {
      const idx = s.chats.findIndex((c) => c.id === chat.id);
      const chats = [...s.chats];
      if (idx >= 0) {
        const prior = chats[idx];
        const serverIds = new Set(chat.messages.map((m) => m.id));
        // Preserve any locally pending messages that the server doesn't know about yet.
        const pendingLocal = prior.messages.filter(
          (m) => m.pending && !serverIds.has(m.id),
        );
        chats[idx] = {
          ...chat,
          messages: [...chat.messages, ...pendingLocal],
        };
      } else {
        chats.push(chat);
      }
      return { ...s, chats, activeChatId: chat.id };
    });
  }, []);

  const createChat = useCallback(async () => {
    const placeholderId = `local-${Date.now()}`;
    const now = new Date().toISOString();
    const placeholder: AssistantChat = {
      id: placeholderId,
      title: null,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    setState((s) => ({
      ...s,
      chats: [...s.chats, placeholder],
      activeChatId: placeholderId,
      loading: false,
    }));

    const created = await assistantApi.createConversation();
    const chat = mapConversation(created);
    setState((s) => {
      const chats = s.chats.map((row) =>
        row.id === placeholderId
          ? { ...chat, messages: row.messages, updatedAt: row.updatedAt }
          : row,
      );
      return { ...s, chats, activeChatId: chat.id, loading: false };
    });
    return chat.id;
  }, []);

  const loadChat = useCallback(
    async (chatId: string) => {
      const full = await assistantApi.getConversation(chatId);
      upsertChat(mapConversation(full));
    },
    [upsertChat],
  );

  const openChat = useCallback((chatId: string) => {
    setState((s) => ({ ...s, activeChatId: chatId }));
    void loadChat(chatId);
  }, [loadChat]);

  const deleteChat = useCallback(async (chatId: string) => {
    await assistantApi.deleteConversation(chatId);
    setState((s) => {
      const chats = s.chats.filter((c) => c.id !== chatId);
      const groups = s.groups
        .map((g) => ({
          ...g,
          conversationIds: g.conversationIds.filter((id) => id !== chatId),
        }))
        .filter((g) => g.conversationIds.length > 0);
      let activeChatId = s.activeChatId;
      if (activeChatId === chatId) {
        activeChatId = chats[chats.length - 1]?.id ?? null;
      }
      return { ...s, chats, groups, activeChatId, loading: false };
    });
  }, []);

  const clearAllChats = useCallback(async () => {
    await assistantApi.clearConversations();
    setState({ chats: [], groups: [], activeChatId: null, loading: false });
  }, []);

  const deleteMessage = useCallback(async (chatId: string, messageId: string) => {
    await assistantApi.deleteMessage(chatId, messageId);
    setState((s) => {
      const chats = s.chats.map((chat) => {
        if (chat.id !== chatId) return chat;
        // Match on either id: callers may pass the optimistic React-key id
        // (entry.id) or the persisted server id (entry.serverMessageId).
        const messages = chat.messages.filter(
          (m) => m.id !== messageId && m.serverMessageId !== messageId,
        );
        return {
          ...chat,
          messages,
          updatedAt: messages[messages.length - 1]?.createdAt ?? chat.updatedAt,
        };
      });
      return { ...s, chats };
    });
  }, []);

  const ensureConversationId = useCallback(
    async (targetChatId?: string) => {
      if (targetChatId) {
        return targetChatId;
      }
      if (state.activeChatId) {
        return state.activeChatId;
      }
      return createChat();
    },
    [createChat, state.activeChatId],
  );

  const applyServerMessage = useCallback(
    (chatId: string, message: AssistantMessage, optimisticId?: string) => {
      // If the user cancelled this optimistic message, drop the server reply.
      if (optimisticId && cancelledIdsRef.current.has(optimisticId)) {
        cancelledIdsRef.current.delete(optimisticId);
        return null;
      }
      const serverEntry = mapMessage(message);
      let appliedEntry = serverEntry;
      setState((s) => {
        const chats = [...s.chats];
        const idx = chats.findIndex((c) => c.id === chatId);
        if (idx < 0) {
          chats.push({
            id: chatId,
            title: null,
            createdAt: serverEntry.createdAt,
            updatedAt: serverEntry.createdAt,
            messages: [serverEntry],
          });
          return { ...s, chats, activeChatId: chatId, loading: false };
        }

        const chat = chats[idx];
        const existingIdx = chat.messages.findIndex(
          (m) => m.id === serverEntry.id || (optimisticId && m.id === optimisticId),
        );
        const messages = [...chat.messages];
        if (existingIdx >= 0) {
          // Preserve the existing row's React key so the bubble doesn't
          // remount when the optimistic id is replaced by the server id;
          // remounting silently breaks the assistant typewriter animation
          // because wasPendingRef re-initializes to its current value.
          const existing = messages[existingIdx];
          appliedEntry = {
            ...serverEntry,
            id: existing.id,
            serverMessageId: serverEntry.id,
          };
          messages[existingIdx] = appliedEntry;
        } else {
          messages.push(serverEntry);
        }

        chats[idx] = {
          ...chat,
          messages,
          updatedAt: serverEntry.createdAt,
        };
        return { ...s, chats, activeChatId: chatId, loading: false };
      });
      return appliedEntry;
    },
    [],
  );

  const appendOptimistic = useCallback((chatId: string, entry: AssistantHistoryEntry) => {
    setState((s) => {
      const chats = [...s.chats];
      const idx = chats.findIndex((c) => c.id === chatId);
      if (idx < 0) {
        chats.push({
          id: chatId,
          title: null,
          createdAt: entry.createdAt,
          updatedAt: entry.createdAt,
          messages: [entry],
        });
        return { ...s, chats, activeChatId: chatId, loading: false };
      }
      const chat = chats[idx];
      chats[idx] = {
        ...chat,
        messages: [...chat.messages, entry],
        updatedAt: entry.createdAt,
      };
      return { ...s, chats, activeChatId: chatId, loading: false };
    });
  }, []);

  /**
   * Consume one SSE command stream into the optimistic bubble. Tokens
   * are appended in place — the existing TypewriterText catches up to
   * the growing target string, which is exactly what the streaming
   * polish was designed to feed it. The `done` event swaps the
   * optimistic id for the persisted server id without remounting the
   * bubble, preserving the typewriter's internal state.
   */
  const consumeCommandStream = useCallback(
    async (
      chatId: string,
      optimisticId: string,
      body: RunAssistantCommandRequest,
      controller: AbortController,
      fallback: AssistantHistoryEntry,
    ): Promise<AssistantHistoryEntry> => {
      let accumulated = '';
      let appliedEntry: AssistantHistoryEntry | null = null;

      try {
        for await (const evt of assistantApi.runCommandStream(chatId, body, controller.signal)) {
          // Belt-and-braces: a token may have queued before our abort
          // signal reached the server. Drop anything past cancellation.
          if (cancelledIdsRef.current.has(optimisticId)) break;

          if (evt.type === 'phase') {
            // Surface the backend lifecycle phase as a live status line on
            // the pending bubble (understanding → working → writing).
            const phase = evt.phase;
            setState((s) => ({
              ...s,
              chats: s.chats.map((chat) =>
                chat.id !== chatId
                  ? chat
                  : {
                      ...chat,
                      messages: chat.messages.map((m) =>
                        m.id === optimisticId ? { ...m, phase } : m,
                      ),
                    },
              ),
            }));
          } else if (evt.type === 'token') {
            accumulated += evt.delta;
            const snapshot = accumulated;
            setState((s) => ({
              ...s,
              chats: s.chats.map((chat) =>
                chat.id !== chatId
                  ? chat
                  : {
                      ...chat,
                      messages: chat.messages.map((m) =>
                        m.id === optimisticId ? { ...m, response: snapshot } : m,
                      ),
                    },
              ),
            }));
          } else if (evt.type === 'done') {
            // applyServerMessage preserves the optimistic React key (so
            // the bubble doesn't remount) and lands the canonical
            // persisted text — which should match `accumulated` for
            // streamed responses, so the TypewriterText sees a no-op.
            appliedEntry = applyServerMessage(chatId, evt.message, optimisticId);
          }
        }
      } finally {
        pendingControllersRef.current.delete(optimisticId);
      }

      if (cancelledIdsRef.current.has(optimisticId)) {
        cancelledIdsRef.current.delete(optimisticId);
        return { ...fallback, response: 'Cancelled.', status: 'error' as const, pending: false };
      }
      return appliedEntry ?? fallback;
    },
    [applyServerMessage],
  );

  const runCommand = useCallback(
    async (
      command: string,
      source: AssistantHistoryEntry['source'] = 'text',
      conversationId?: string,
    ): Promise<AssistantHistoryEntry> => {
      const knownChatId = conversationId;
      const optimisticId = `pending-${Date.now()}`;
      const optimistic: AssistantHistoryEntry = {
        id: optimisticId,
        command,
        response: 'Sending…',
        status: 'success',
        createdAt: new Date().toISOString(),
        source,
        pending: true,
      };

      if (knownChatId) {
        appendOptimistic(knownChatId, optimistic);
      }

      const chatId = await ensureConversationId(conversationId);

      if (!knownChatId || knownChatId !== chatId) {
        appendOptimistic(chatId, optimistic);
      }

      const controller = new AbortController();
      pendingControllersRef.current.set(optimisticId, controller);

      try {
        return await consumeCommandStream(
          chatId,
          optimisticId,
          { text: command, source },
          controller,
          optimistic,
        );
      } catch (err) {
        if (cancelledIdsRef.current.has(optimisticId)) {
          cancelledIdsRef.current.delete(optimisticId);
          return { ...optimistic, response: 'Cancelled.', status: 'error' as const, pending: false };
        }
        const response =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Something went wrong while running your command.';
        setState((s) => {
          const chats = s.chats.map((chat) => {
            if (chat.id !== chatId) return chat;
            const messages = chat.messages.map((m) =>
              m.id === optimisticId
                ? { ...m, response, status: 'error' as const, pending: false }
                : m,
            );
            return { ...chat, messages };
          });
          return { ...s, chats, activeChatId: chatId };
        });
        return { ...optimistic, response, status: 'error' as const, pending: false };
      }
    },
    [appendOptimistic, consumeCommandStream, ensureConversationId],
  );

  const addVoiceMessage = useCallback(
    (voiceUri: string, chatId?: string) => {
      const optimisticId = `pending-voice-${Date.now()}`;
      const entry: AssistantHistoryEntry = {
        id: optimisticId,
        command: 'Voice message',
        response: 'Sending…',
        status: 'success',
        createdAt: new Date().toISOString(),
        source: 'voice',
        voiceUri,
        pending: true,
      };

      if (chatId) {
        appendOptimistic(chatId, entry);
      }

      void (async () => {
        let convId = '';
        try {
          convId = await ensureConversationId(chatId);
          if (!chatId) {
            appendOptimistic(convId, entry);
          }
        } catch {
          return;
        }

        setState((s) => ({
          ...s,
          chats: s.chats.map((chat) => {
            if (chat.id !== convId) return chat;
            return {
              ...chat,
              messages: chat.messages.map((m) =>
                m.id === optimisticId
                  ? { ...m, response: 'Transcribing your recording…' }
                  : m,
              ),
            };
          }),
        }));

        try {
          const transcribed = await voiceApi.transcribe(voiceUri);
          if (cancelledIdsRef.current.has(optimisticId)) {
            cancelledIdsRef.current.delete(optimisticId);
            return;
          }
          const transcript = transcribed.transcript?.trim() ?? '';

          if (!transcript) {
            // No real speech — silence/noise, a stock hallucination, or the
            // model echoing our priming prompt. Drop the optimistic bubble and
            // tell the user via a popup instead of leaving a phantom command.
            setState((s) => ({
              ...s,
              chats: s.chats.map((chat) =>
                chat.id !== convId
                  ? chat
                  : {
                      ...chat,
                      messages: chat.messages.filter((m) => m.id !== optimisticId),
                    },
              ),
            }));
            Alert.alert(
              "Didn't catch that",
              "We didn't detect any speech. Please try again and speak clearly in English.",
            );
            return;
          }

          // Reflect the transcript on the user's bubble while the command runs.
          setState((s) => ({
            ...s,
            chats: s.chats.map((chat) => {
              if (chat.id !== convId) return chat;
              return {
                ...chat,
                messages: chat.messages.map((m) =>
                  m.id === optimisticId
                    ? {
                        ...m,
                        command: transcript,
                        transcript,
                        response: 'Running your command…',
                      }
                    : m,
                ),
              };
            }),
          }));

          // No `intent` field — the backend's /commands handler will run the
          // normalizer with full conversation history + session context, which
          // catches pronoun-resolution and follow-ups (e.g. "yes", "make it
          // 2pm") that a history-blind transcribe-time call would miss.
          const controller = new AbortController();
          pendingControllersRef.current.set(optimisticId, controller);
          await consumeCommandStream(
            convId,
            optimisticId,
            {
              text: transcript,
              source: 'voice',
              transcript,
              voiceUri,
            },
            controller,
            entry,
          );
        } catch (err) {
          if (cancelledIdsRef.current.has(optimisticId)) {
            cancelledIdsRef.current.delete(optimisticId);
            return;
          }
          const message =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Could not transcribe the recording.';
          if (!convId) return;
          setState((s) => ({
            ...s,
            chats: s.chats.map((chat) => {
              if (chat.id !== convId) return chat;
              return {
                ...chat,
                messages: chat.messages.map((m) =>
                  m.id === optimisticId
                    ? { ...m, response: message, pending: false, status: 'error' as const }
                    : m,
                ),
              };
            }),
          }));
        }
      })();

      return entry;
    },
    [appendOptimistic, consumeCommandStream, ensureConversationId],
  );

  const cancelPendingMessages = useCallback((chatId: string) => {
    const idsToAbort: string[] = [];
    setState((s) => {
      let touched = false;
      const chats = s.chats.map((chat) => {
        if (chat.id !== chatId) return chat;
        const messages = chat.messages.map((m) => {
          if (!m.pending) return m;
          cancelledIdsRef.current.add(m.id);
          idsToAbort.push(m.id);
          touched = true;
          return {
            ...m,
            response: 'Cancelled.',
            status: 'error' as const,
            pending: false,
          };
        });
        return { ...chat, messages };
      });
      return touched ? { ...s, chats } : s;
    });
    // Abort the SSE streams so we stop billing the user's OpenAI key
    // immediately. The streaming consumer's signal handler tears down
    // the connection and exits cleanly; the cancelledIdsRef guard
    // ensures any in-flight `done` event is still ignored.
    for (const id of idsToAbort) {
      const controller = pendingControllersRef.current.get(id);
      if (controller) {
        controller.abort();
        pendingControllersRef.current.delete(id);
      }
    }
  }, []);

  const value = useMemo<AssistantHistoryContextValue>(
    () => ({
      chats: state.chats,
      chatGroups: state.groups,
      activeChatId: state.activeChatId,
      activeMessages,
      loading: state.loading,
      createChat,
      openChat,
      loadChat,
      deleteChat,
      deleteMessage,
      clearAllChats,
      refreshChats,
      runCommand,
      addVoiceMessage,
      cancelPendingMessages,
    }),
    [
      state.chats,
      state.groups,
      state.activeChatId,
      state.loading,
      activeMessages,
      createChat,
      openChat,
      loadChat,
      deleteChat,
      deleteMessage,
      clearAllChats,
      refreshChats,
      runCommand,
      addVoiceMessage,
      cancelPendingMessages,
    ],
  );

  return (
    <AssistantHistoryContext.Provider value={value}>{children}</AssistantHistoryContext.Provider>
  );
}

export function useAssistantHistory() {
  const context = useContext(AssistantHistoryContext);

  if (!context) {
    throw new Error('useAssistantHistory must be used inside AssistantHistoryProvider');
  }

  return context;
}
