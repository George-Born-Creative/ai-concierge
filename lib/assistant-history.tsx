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

import { assistantApi, voiceApi } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import type { AssistantMessage, VoiceIntent } from '@/lib/api/types';
import { getToken, subscribeSession } from '@/lib/session';

export type AssistantCommandStatus = 'success' | 'error';

export type AssistantHistoryEntry = {
  id: string;
  command: string;
  response: string;
  status: AssistantCommandStatus;
  createdAt: string;
  source: 'text' | 'voice';
  voiceUri?: string;
  pending?: boolean;
  transcript?: string;
  intent?: VoiceIntent;
};

export type AssistantChat = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages: AssistantHistoryEntry[];
  messageCount?: number;
};

type AssistantState = {
  chats: AssistantChat[];
  activeChatId: string | null;
  loading: boolean;
};

function mapMessage(message: AssistantMessage): AssistantHistoryEntry {
  return {
    id: message.id,
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
    activeChatId: null,
    loading: true,
  });
  // Optimistic message ids that the user cancelled. We can't abort the
  // server-side write cleanly, but we can drop the eventual response so the UI
  // doesn't suddenly fill in the answer after the user said "stop".
  const cancelledIdsRef = useRef<Set<string>>(new Set());

  const refreshChats = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setState({ chats: [], activeChatId: null, loading: false });
      return;
    }

    try {
      const summaries = await assistantApi.listConversations();
      setState((s) => {
        const existing = new Map(s.chats.map((chat) => [chat.id, chat]));
        const chats: AssistantChat[] = summaries.map((summary) => {
          const prior = existing.get(summary.id);
          if (prior && prior.messages.length > 0) {
            return {
              ...prior,
              title: summary.title,
              updatedAt: summary.updatedAt,
            };
          }
          return {
            id: summary.id,
            title: summary.title,
            createdAt: summary.createdAt,
            updatedAt: summary.updatedAt,
            messages: prior?.messages ?? [],
            messageCount: summary.messageCount,
          };
        });
        return {
          chats,
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
      return { chats, activeChatId: chat.id, loading: false };
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
      let activeChatId = s.activeChatId;
      if (activeChatId === chatId) {
        activeChatId = chats[chats.length - 1]?.id ?? null;
      }
      return { chats, activeChatId, loading: false };
    });
  }, []);

  const clearAllChats = useCallback(async () => {
    await assistantApi.clearConversations();
    setState({ chats: [], activeChatId: null, loading: false });
  }, []);

  const deleteMessage = useCallback(async (chatId: string, messageId: string) => {
    await assistantApi.deleteMessage(chatId, messageId);
    setState((s) => {
      const chats = s.chats.map((chat) => {
        if (chat.id !== chatId) return chat;
        const messages = chat.messages.filter((m) => m.id !== messageId);
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
      const entry = mapMessage(message);
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
          return { chats, activeChatId: chatId, loading: false };
        }

        const chat = chats[idx];
        const existingIdx = chat.messages.findIndex(
          (m) => m.id === entry.id || (optimisticId && m.id === optimisticId),
        );
        const messages = [...chat.messages];
        if (existingIdx >= 0) {
          messages[existingIdx] = entry;
        } else {
          messages.push(entry);
        }

        chats[idx] = {
          ...chat,
          messages,
          updatedAt: entry.createdAt,
        };
        return { chats, activeChatId: chatId, loading: false };
      });
      return entry;
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
        return { chats, activeChatId: chatId, loading: false };
      }
      const chat = chats[idx];
      chats[idx] = {
        ...chat,
        messages: [...chat.messages, entry],
        updatedAt: entry.createdAt,
      };
      return { chats, activeChatId: chatId, loading: false };
    });
  }, []);

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

      try {
        const result = await assistantApi.runCommand(chatId, { text: command, source });
        if (cancelledIdsRef.current.has(optimisticId)) {
          cancelledIdsRef.current.delete(optimisticId);
          return { ...optimistic, response: 'Cancelled.', status: 'error' as const, pending: false };
        }
        setState((s) => {
          const chats = s.chats.map((chat) => {
            if (chat.id !== chatId) return chat;
            const messages = chat.messages
              .filter((m) => m.id !== optimisticId)
              .concat(mapMessage(result));
            return { ...chat, messages, updatedAt: result.createdAt };
          });
          return { ...s, chats, activeChatId: chatId };
        });
        return mapMessage(result);
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
    [appendOptimistic, ensureConversationId],
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
                          command: '(no speech detected)',
                          response: 'No speech detected. Try speaking closer to the microphone.',
                          pending: false,
                          status: 'error' as const,
                        }
                      : m,
                  ),
                };
              }),
            }));
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

          const result = await assistantApi.runCommand(convId, {
            text: transcript,
            source: 'voice',
            transcript,
            voiceUri,
            intent: transcribed.intent,
          });
          if (cancelledIdsRef.current.has(optimisticId)) {
            cancelledIdsRef.current.delete(optimisticId);
            return;
          }
          applyServerMessage(convId, result, optimisticId);
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
    [appendOptimistic, applyServerMessage, ensureConversationId],
  );

  const cancelPendingMessages = useCallback((chatId: string) => {
    setState((s) => {
      let touched = false;
      const chats = s.chats.map((chat) => {
        if (chat.id !== chatId) return chat;
        const messages = chat.messages.map((m) => {
          if (!m.pending) return m;
          cancelledIdsRef.current.add(m.id);
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
  }, []);

  const value = useMemo<AssistantHistoryContextValue>(
    () => ({
      chats: state.chats,
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
