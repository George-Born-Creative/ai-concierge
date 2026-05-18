import { createContext, PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react';

import { voiceApi } from '@/lib/api';
import type { VoiceIntent } from '@/lib/api/types';
import {
  AssistantCommandStatus,
  executeContactCommand,
} from '@/lib/contact-assistant';

export type AssistantHistoryEntry = {
  id: string;
  command: string;
  response: string;
  status: AssistantCommandStatus;
  createdAt: string;
  source: 'text' | 'voice';
  voiceUri?: string;
  // Populated for voice messages once /voice/transcribe completes.
  pending?: boolean;
  transcript?: string;
  intent?: VoiceIntent;
};

export type AssistantChat = {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: AssistantHistoryEntry[];
};

type AssistantState = {
  chats: AssistantChat[];
  activeChatId: string | null;
};

function newChatId() {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyChat(): AssistantChat {
  const now = new Date().toISOString();
  return {
    id: newChatId(),
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

type AssistantHistoryContextValue = {
  chats: AssistantChat[];
  activeChatId: string | null;
  activeMessages: AssistantHistoryEntry[];
  createChat: () => string;
  openChat: (chatId: string) => void;
  deleteChat: (chatId: string) => void;
  clearAllChats: () => void;
  runCommand: (
    command: string,
    source?: AssistantHistoryEntry['source']
  ) => Promise<AssistantHistoryEntry>;
  addVoiceMessage: (voiceUri: string) => AssistantHistoryEntry;
};

const AssistantHistoryContext = createContext<AssistantHistoryContextValue | null>(null);

export function AssistantHistoryProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AssistantState>({ chats: [], activeChatId: null });

  const activeMessages = useMemo(() => {
    const chat = state.chats.find((c) => c.id === state.activeChatId);
    return chat?.messages ?? [];
  }, [state.chats, state.activeChatId]);

  const createChat = useCallback(() => {
    const chat = emptyChat();
    setState((s) => ({
      chats: [...s.chats, chat],
      activeChatId: chat.id,
    }));
    return chat.id;
  }, []);

  const openChat = useCallback((chatId: string) => {
    setState((s) => {
      if (!s.chats.some((c) => c.id === chatId)) {
        return s;
      }
      return { ...s, activeChatId: chatId };
    });
  }, []);

  const deleteChat = useCallback((chatId: string) => {
    setState((s) => {
      const chats = s.chats.filter((c) => c.id !== chatId);
      let activeChatId = s.activeChatId;
      if (activeChatId === chatId) {
        activeChatId = chats[chats.length - 1]?.id ?? null;
      }
      return { chats, activeChatId };
    });
  }, []);

  const clearAllChats = useCallback(() => {
    setState({ chats: [], activeChatId: null });
  }, []);

  const appendEntry = useCallback((entry: AssistantHistoryEntry) => {
    setState((s) => {
      const chats = [...s.chats];
      let activeChatId = s.activeChatId;
      let idx = activeChatId ? chats.findIndex((c) => c.id === activeChatId) : -1;

      if (idx < 0) {
        const chat = emptyChat();
        chats.push(chat);
        activeChatId = chat.id;
        idx = chats.length - 1;
      }

      const chat = chats[idx];
      const now = new Date().toISOString();
      chats[idx] = {
        ...chat,
        messages: [...chat.messages, entry],
        updatedAt: now,
      };
      return { chats, activeChatId };
    });
  }, []);

  const updateEntry = useCallback(
    (entryId: string, patch: Partial<AssistantHistoryEntry>) => {
      setState((s) => {
        const chats = s.chats.map((chat) => {
          const idx = chat.messages.findIndex((m) => m.id === entryId);
          if (idx < 0) return chat;
          const messages = [...chat.messages];
          messages[idx] = { ...messages[idx], ...patch };
          return { ...chat, messages, updatedAt: new Date().toISOString() };
        });
        return { ...s, chats };
      });
    },
    [],
  );

  const runCommand = useCallback(
    async (command: string, source: AssistantHistoryEntry['source'] = 'text') => {
      const result = await executeContactCommand(command);
      const entry: AssistantHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        command,
        response: result.response,
        status: result.status,
        createdAt: new Date().toISOString(),
        source,
      };
      appendEntry(entry);
      return entry;
    },
    [appendEntry]
  );

  const addVoiceMessage = useCallback(
    (voiceUri: string) => {
      const entry: AssistantHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        command: 'Voice message',
        response: 'Transcribing your recording…',
        status: 'success',
        createdAt: new Date().toISOString(),
        source: 'voice',
        voiceUri,
        pending: true,
      };
      appendEntry(entry);

      // Fire-and-forget: hit /voice/transcribe and patch the entry when the
      // backend returns transcript + normalized intent JSON. The bubble
      // re-renders automatically because we update via setState.
      void (async () => {
        try {
          const result = await voiceApi.transcribe(voiceUri);
          const transcript = result.transcript || '(no speech detected)';
          updateEntry(entry.id, {
            command: transcript,
            response: formatIntentResponse(result.intent),
            transcript: result.transcript,
            intent: result.intent,
            pending: false,
            status: 'success',
          });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Could not transcribe the recording.';
          updateEntry(entry.id, {
            response: message,
            pending: false,
            status: 'error',
          });
        }
      })();

      return entry;
    },
    [appendEntry, updateEntry]
  );

  const value = useMemo<AssistantHistoryContextValue>(
    () => ({
      chats: state.chats,
      activeChatId: state.activeChatId,
      activeMessages,
      createChat,
      openChat,
      deleteChat,
      clearAllChats,
      runCommand,
      addVoiceMessage,
    }),
    [
      state.chats,
      state.activeChatId,
      activeMessages,
      createChat,
      openChat,
      deleteChat,
      clearAllChats,
      runCommand,
      addVoiceMessage,
    ]
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

// Renders the intent JSON into something a human reads first.
function formatIntentResponse(intent: VoiceIntent): string {
  const header = `Intent: ${intent.intent} (confidence ${(intent.confidence * 100).toFixed(0)}%)`;
  const entityEntries = Object.entries(intent.entities ?? {});
  const entities = entityEntries.length
    ? entityEntries.map(([k, v]) => `  ${k}: ${v ?? '—'}`).join('\n')
    : '  (none extracted)';
  const clarification = intent.needs_clarification ? '\nNeeds clarification.' : '';
  const notes = intent.notes ? `\nNote: ${intent.notes}` : '';
  return `${header}\nEntities:\n${entities}${clarification}${notes}`;
}
