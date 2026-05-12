import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

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
};

type AssistantHistoryContextValue = {
  history: AssistantHistoryEntry[];
  runCommand: (command: string, source?: AssistantHistoryEntry['source']) => Promise<AssistantHistoryEntry>;
  addVoiceMessage: (voiceUri: string) => AssistantHistoryEntry;
  clearHistory: () => void;
};

const AssistantHistoryContext = createContext<AssistantHistoryContextValue | null>(null);

export function AssistantHistoryProvider({ children }: PropsWithChildren) {
  const [history, setHistory] = useState<AssistantHistoryEntry[]>([]);

  const value = useMemo<AssistantHistoryContextValue>(
    () => ({
      history,
      runCommand: async (command, source = 'text') => {
        const result = await executeContactCommand(command);
        const entry: AssistantHistoryEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          command,
          response: result.response,
          status: result.status,
          createdAt: new Date().toISOString(),
          source,
        };

        setHistory((currentHistory) => [entry, ...currentHistory]);
        return entry;
      },
      addVoiceMessage: (voiceUri) => {
        const entry: AssistantHistoryEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          command: 'Voice message',
          response:
            'Voice recording received. It is ready to send to speech-to-text, then run as a contact command.',
          status: 'success',
          createdAt: new Date().toISOString(),
          source: 'voice',
          voiceUri,
        };

        setHistory((currentHistory) => [entry, ...currentHistory]);
        return entry;
      },
      clearHistory: () => setHistory([]),
    }),
    [history]
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
