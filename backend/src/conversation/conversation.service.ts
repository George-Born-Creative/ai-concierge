import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

import { OpenAIKeysService } from '../openai-keys/openai-keys.service';
import type { PendingIntent } from '../assistant/assistant.types';

const CHAT_MODEL = 'gpt-4o-mini';
const MAX_HISTORY_TURNS = 10;

const SYSTEM_PROMPT_BASE = `You are a friendly, knowledgeable AI assistant inside a GoHighLevel CRM mobile app.

You can help in two ways:
1. Talk naturally — answer questions, explain CRM concepts (contacts, calendars, opportunities, pipelines), brainstorm, give advice, hold a normal conversation.
2. Take actions — when the user clearly asks for something (e.g. "create a contact", "show my calendar", "book Sarah tomorrow"), the surrounding system automatically routes that to the right tool. You don't need to invoke tools yourself; another module handles execution. Your job for action requests is to be a graceful conversational layer around them.

Style:
- Talk like a thoughtful human assistant, not a command parser.
- Be concise but warm. No bulleted menus, no "I can also…" lists unless the user asks what you can do.
- Never tell the user to "say something like X" or recite supported commands.
- If the user asks about CRM concepts (e.g. "what does an opportunity do?", "what's the difference between a contact and a lead?"), explain it clearly in 2–4 sentences, like a friendly product expert.
- Match the user's energy. Short messages get short replies.
- If the user expresses frustration, acknowledge it and adjust.

You are talking with a real CRM operator. Be respectful of their time.`;

export type ConversationTurn = {
  role: 'user' | 'assistant';
  content: string;
};

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(private readonly keys: OpenAIKeysService) {}

  /**
   * Produces a natural-language reply for the user. When a pending CRM task is
   * active, the system prompt nudges the assistant to acknowledge it after
   * answering the tangent, so we can pick the workflow back up smoothly.
   */
  async respond(input: {
    userId: string;
    userMessage: string;
    history: ConversationTurn[];
    pendingIntent?: PendingIntent | null;
  }): Promise<string> {
    const apiKey = await this.keys.getDecryptedKey(input.userId);
    const openai = new OpenAI({ apiKey });

    const systemPrompt = this.buildSystemPrompt(input.pendingIntent);

    const trimmedHistory = input.history.slice(-MAX_HISTORY_TURNS);
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...trimmedHistory.map((turn) => ({
        role: turn.role,
        content: turn.content,
      })),
      { role: 'user', content: input.userMessage },
    ];

    try {
      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages,
        temperature: 0.6,
        max_tokens: 400,
      });
      const reply = completion.choices[0]?.message?.content?.trim();
      if (reply) return reply;
    } catch (err) {
      this.logger.warn(`Chat completion failed for ${input.userId}: ${(err as Error).message}`);
    }

    // Graceful fallback so the user always gets something useful back.
    if (input.pendingIntent?.question) {
      return `I'm here. We were in the middle of: ${input.pendingIntent.question}`;
    }
    return "I'm here — what would you like to do?";
  }

  private buildSystemPrompt(pending?: PendingIntent | null): string {
    const now = new Date();
    const dateLine = `Today is ${now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })}.`;

    if (!pending) {
      return `${SYSTEM_PROMPT_BASE}\n\n${dateLine}`;
    }

    const collected = Object.entries(pending.entities)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(', ');

    const next = pending.missing[0];
    const taskBlock = `Active task in progress: ${pending.intent}.
Collected so far: ${collected || '(nothing yet)'}.
Next thing the system needs from the user: ${pending.question}${next ? ` (field: ${next})` : ''}.

If the user is answering this question, treat their reply as the answer and the system will continue automatically.
If the user goes on a tangent (asks a question, changes subject), answer them naturally, then in one short sentence offer to pick the task back up — e.g. "Whenever you're ready, just tell me ${
      next === 'name'
        ? 'the opportunity name'
        : next === 'monetaryValue'
          ? 'the value'
          : next === 'pipelineName'
            ? 'the pipeline'
            : 'and we can keep going'
    }." Do NOT restart the task from scratch.`;

    return `${SYSTEM_PROMPT_BASE}\n\n${dateLine}\n\n${taskBlock}`;
  }
}
