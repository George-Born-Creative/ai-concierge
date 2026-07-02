import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

import { OpenAIKeysService } from '../openai-keys/openai-keys.service';
import type { PendingIntent } from '../assistant/assistant.types';

const CHAT_MODEL = 'gpt-4o-mini';
const MAX_HISTORY_TURNS = 10;

const POLISH_SYSTEM_PROMPT = `You are the friendly voice of a CRM assistant inside a mobile app. The CRM system has just successfully run an action on the user's behalf and produced FACTUAL_RESPONSE — a deterministic, ground-truth description of exactly what happened. Your job is to rewrite FACTUAL_RESPONSE in a warmer, more conversational concierge tone, keeping the message tight (2–3 sentences for write actions; for list/find actions that include a bullet list, keep the bullets verbatim and only polish the surrounding sentences).

Strict rules — these protect data integrity:
- NEVER invent, add, omit, or alter facts. Names, phone numbers, emails, dollar amounts, ids, dates, times, statuses, pipeline names, calendar names, deal names, company names, and counts MUST match FACTUAL_RESPONSE exactly. If FACTUAL_RESPONSE says "Sarah Smith", you write "Sarah Smith" — never "Sarah", never "Sarah Jones".
- If FACTUAL_RESPONSE contains a bullet list (lines starting with "·"), keep every bullet's text verbatim and in the same order (do not summarize, reorder, or skip bullets), but render each bullet as a Markdown list item — use a "- " prefix instead of "·".
- If FACTUAL_RESPONSE contains a follow-up suggestion (e.g. 'say "attach Sarah to it"'), keep an equivalent suggestion. You may rephrase it, but keep the same intent and any quoted user phrases unchanged.
- NEVER claim an additional action ("…and I also…", "I'll go ahead and notify them"). Only describe what FACTUAL_RESPONSE describes.
- NEVER apologize for the system, second-guess the action, or ask follow-up clarifying questions of your own.

Style:
- Concierge, not a log line. Confident, warm, and helpful — like a personal assistant reporting a quick task done.
- Match the user's energy: short command → short reply.
- Don't start with "Sure", "Of course", "I've", "Got it".
- No greetings, sign-offs, or emoji.
- Use light Markdown for readability: **bold** for key names, values, and counts; \`inline code\` for ids or exact field values; "- " for any list. Do NOT use Markdown headings (#) or tables.

Output: just the polished response text — no JSON, no preamble, no commentary about what you changed.`;

const SYSTEM_PROMPT_BASE = `You are a friendly, knowledgeable AI assistant inside a GoHighLevel CRM mobile app.

You can help in two ways:
1. Talk naturally — answer questions, explain CRM concepts (contacts, calendars, opportunities, pipelines), brainstorm, give advice, hold a normal conversation.
2. The surrounding system handles CRM actions (create / update / delete contacts, calendars, appointments, pipelines, opportunities) BEFORE you see the message. If you are being asked to reply, the system did NOT execute an action on this turn — either because the user is chatting, asking a question, or you're filling in for a tangent.

Critical rules about actions — you MUST follow these:
- NEVER claim to have performed, scheduled, or queued a CRM action. Phrases like "I've updated…", "I'll go ahead and update…", "Updating now…", "Sure, creating it…", "Let me take care of that…" are forbidden. The system already decided not to run an action this turn, so saying you did or will would be a lie.
- If the user clearly wants a CRM action but you're being asked to reply, the action wasn't recognized. Tell them so honestly: e.g. "I couldn't run that as an action — try rephrasing like 'update Jordan Smith's phone to 555-1234' so I can pick it up."
- If the user is asking what you CAN do, briefly mention contacts, calendars, appointments, and opportunities — no exhaustive menu.

Style:
- Talk like a thoughtful human assistant, not a command parser.
- Be concise but warm. No bulleted menus, no "I can also…" lists unless the user asks what you can do.
- Never tell the user to "say something like X" or recite supported commands beyond the rephrase hint above.
- If the user asks about CRM concepts (e.g. "what does an opportunity do?", "what's the difference between a contact and a lead?"), explain it clearly in 2–4 sentences, like a friendly product expert.
- Match the user's energy. Short messages get short replies.
- If the user expresses frustration, acknowledge it and adjust.
- Format with light Markdown when it aids clarity: **bold** for emphasis, "- " bullets for genuine lists (not capability menus), and \`inline code\` for ids, field values, or example commands. Avoid Markdown headings (#) and tables — keep it chat-friendly.

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

    return this.staticFallback(input.pendingIntent);
  }

  /**
   * Streaming variant of {@link respond}. Yields tokens as the LLM emits
   * them so the caller (the SSE pipeline in `AssistantService`) can
   * forward each delta to the client. Contract: this generator never
   * throws — on any failure it yields a useful static fallback so the
   * client always sees a response.
   */
  async *respondStream(input: {
    userId: string;
    userMessage: string;
    history: ConversationTurn[];
    pendingIntent?: PendingIntent | null;
  }): AsyncGenerator<string, void, void> {
    let openai: OpenAI;
    try {
      const apiKey = await this.keys.getDecryptedKey(input.userId);
      openai = new OpenAI({ apiKey });
    } catch (err) {
      this.logger.warn(
        `respondStream key lookup failed for ${input.userId}: ${(err as Error).message}`,
      );
      yield this.staticFallback(input.pendingIntent);
      return;
    }

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

    let anyTokens = false;
    try {
      const stream = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages,
        temperature: 0.6,
        max_tokens: 400,
        stream: true,
      });
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          anyTokens = true;
          yield delta;
        }
      }
    } catch (err) {
      this.logger.warn(
        `respondStream completion failed for ${input.userId}: ${(err as Error).message}`,
      );
      // Fall through: if we already emitted something the partial reply is
      // kept; otherwise the static fallback is sent below.
    }

    if (!anyTokens) yield this.staticFallback(input.pendingIntent);
  }

  /**
   * Static fallback string used by both the buffered {@link respond} and
   * streaming {@link respondStream} on any LLM failure, so the caller
   * always has something useful to surface to the user.
   */
  private staticFallback(pending?: PendingIntent | null): string {
    if (pending?.question) {
      return `I'm here. We were in the middle of: ${pending.question}`;
    }
    return "I'm here — what would you like to do?";
  }

  /**
   * Rephrase a deterministic action result in concierge tone.
   *
   * The CRM command services produce a factual baseline (e.g. "Done — Sarah
   * Smith is now in HubSpot (phone 555-1234)…") that is the ground truth of
   * what just happened. This method asks the LLM to rewrite that baseline in
   * a warmer, more natural voice — without ever inventing or altering the
   * facts. Any failure (network error, timeout, empty completion, etc.)
   * falls back to the original baseline so the user always sees a reply.
   *
   * Only call this on successful actionable intents — clarifying questions
   * (`pendingIntent.question`) and tangent replies should stay deterministic
   * or use {@link respond} directly.
   */
  async polishActionResponse(input: {
    userId: string;
    userMessage: string;
    intent: string;
    /** The factual response produced by the command executor. Source of truth. */
    baseline: string;
    /** Optional brief history so the LLM can match the user's tone / style. */
    history?: ConversationTurn[];
  }): Promise<string> {
    const baseline = input.baseline?.trim();
    if (!baseline) return input.baseline;

    let openai: OpenAI;
    try {
      const apiKey = await this.keys.getDecryptedKey(input.userId);
      openai = new OpenAI({ apiKey });
    } catch (err) {
      this.logger.warn(
        `polishActionResponse key lookup failed for ${input.userId}: ${(err as Error).message}`,
      );
      return baseline;
    }

    const trimmedHistory = (input.history ?? []).slice(-MAX_HISTORY_TURNS);
    const userBlock = [
      `User said: "${input.userMessage}"`,
      `Intent that ran: ${input.intent}`,
      `FACTUAL_RESPONSE (rewrite this in concierge tone — do not change any facts):`,
      baseline,
    ].join('\n\n');

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: POLISH_SYSTEM_PROMPT },
      ...trimmedHistory.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: 'user', content: userBlock },
    ];

    try {
      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages,
        // Lower than respond()'s 0.6 — we want stylistic variety, not creative
        // restructuring. Higher temps tempt the LLM to "improve" facts.
        temperature: 0.3,
        max_tokens: 320,
      });
      const reply = completion.choices[0]?.message?.content?.trim();
      if (reply) return reply;
    } catch (err) {
      this.logger.warn(
        `polishActionResponse failed for ${input.userId} on intent "${input.intent}": ${
          (err as Error).message
        }`,
      );
    }
    return baseline;
  }

  /**
   * Streaming variant of {@link polishActionResponse}. Yields polish
   * tokens as the LLM emits them. Contract: this generator never throws
   * — if the stream errors before any tokens were emitted (or the key
   * lookup fails), the deterministic baseline is yielded instead so the
   * caller always sees a response. If the stream errors *after* some
   * tokens were emitted, the partial polish is kept rather than being
   * replaced — a partial concierge reply is closer to the truth than
   * appending a duplicate baseline string.
   */
  async *polishActionResponseStream(input: {
    userId: string;
    userMessage: string;
    intent: string;
    baseline: string;
    history?: ConversationTurn[];
  }): AsyncGenerator<string, void, void> {
    const baseline = input.baseline?.trim();
    if (!baseline) {
      if (input.baseline) yield input.baseline;
      return;
    }

    let openai: OpenAI;
    try {
      const apiKey = await this.keys.getDecryptedKey(input.userId);
      openai = new OpenAI({ apiKey });
    } catch (err) {
      this.logger.warn(
        `polishActionResponseStream key lookup failed for ${input.userId}: ${(err as Error).message}`,
      );
      yield baseline;
      return;
    }

    const trimmedHistory = (input.history ?? []).slice(-MAX_HISTORY_TURNS);
    const userBlock = [
      `User said: "${input.userMessage}"`,
      `Intent that ran: ${input.intent}`,
      `FACTUAL_RESPONSE (rewrite this in concierge tone — do not change any facts):`,
      baseline,
    ].join('\n\n');

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: POLISH_SYSTEM_PROMPT },
      ...trimmedHistory.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: 'user', content: userBlock },
    ];

    let anyTokens = false;
    try {
      const stream = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages,
        temperature: 0.3,
        max_tokens: 320,
        stream: true,
      });
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          anyTokens = true;
          yield delta;
        }
      }
    } catch (err) {
      this.logger.warn(
        `polishActionResponseStream failed for ${input.userId} on intent "${input.intent}": ${
          (err as Error).message
        }`,
      );
    }

    if (!anyTokens) yield baseline;
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
