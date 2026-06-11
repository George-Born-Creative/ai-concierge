import { Injectable, NotFoundException, type MessageEvent } from '@nestjs/common';
import { AssistantMessageSource, AssistantMessageStatus, Prisma } from '@prisma/client';
import { Observable } from 'rxjs';

import type { ConversationTurn } from '../conversation/conversation.service';
import { ConversationService } from '../conversation/conversation.service';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceService } from '../voice/voice.service';
import { AssistantCommandService } from './assistant-command.service';
import {
  isFollowUpAnswer,
  isPendingIntentValid,
  isPositiveConfirmation,
  isSkipAnswer,
  looksLikeQuestion,
  parseMonetaryAnswer,
} from './assistant-command.helpers';
import {
  bucketByDate,
  CONVERSATION_BUCKET_LABELS,
  CONVERSATION_BUCKET_ORDER,
  type ConversationBucketKey,
} from './conversation-buckets';
import type {
  AssistantCommandResult,
  AssistantSessionContext,
  ConversationHistoryTurn,
  PendingIntent,
  VoiceIntentPayload,
} from './assistant.types';
import { RunAssistantCommandDto } from './dto/run-command.dto';

const HISTORY_LIMIT = 15;

/**
 * Wire format for the SSE streaming endpoint. The `data` field of every
 * {@link MessageEvent} emitted by `runCommandStream` is one of these.
 *
 * - `phase` events let the client surface lifecycle indicators
 *   (e.g. swap "Running your command…" for "Thinking…")
 * - `token` events deliver a content delta to append to the in-flight
 *   message bubble — the existing TypewriterText catches up smoothly
 * - `done` carries the persisted server message DTO so the client can
 *   swap the optimistic id and finalise the bubble
 */
export type AssistantMessageDto = {
  id: string;
  command: string;
  response: string;
  status: AssistantMessageStatus;
  source: AssistantMessageSource;
  transcript?: string;
  intent?: unknown;
  voiceUri?: string;
  pending: boolean;
  createdAt: string;
};

export type AssistantStreamEvent =
  | { type: 'phase'; phase: 'normalizing' | 'thinking' }
  | { type: 'token'; delta: string }
  | { type: 'done'; message: AssistantMessageDto };

/**
 * Snapshot of a runCommand pre-polish phase. Produced by
 * {@link AssistantService.prepareCommand} and consumed by either the
 * buffered or streaming polish path before being passed to
 * {@link AssistantService.finalizeCommand} for DB persistence.
 *
 * The `mode` discriminator tells the wrapper which kind of response is
 * pending — an actionable CRM result that may be polished, or a
 * conversational fallback whose LLM call is deferred so the SSE path
 * can stream it (the JSON path runs it buffered).
 */
export type PreparedCommand = {
  userId: string;
  conversationId: string;
  conversationTitle: string | null;
  pendingMessageId: string;
  text: string;
  source: AssistantMessageSource;
  dto: RunAssistantCommandDto;
  baseline: AssistantCommandResult;
  intent: VoiceIntentPayload | undefined;
  ranActionableIntent: boolean;
  historyTurns: ConversationHistoryTurn[];
  sessionContext: AssistantSessionContext;
  /**
   * `'action'` when the executor produced a deterministic baseline that
   * may be polished. `'conversational'` when no actionable intent ran
   * and the response must come from {@link ConversationService.respond}
   * (or its streaming variant).
   */
  mode: 'action' | 'conversational';
  /** For `mode === 'conversational'` — the active pending task, if any, that respond() should reference. */
  pendingTask: PendingIntent | null;
};

@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: AssistantCommandService,
    private readonly voice: VoiceService,
    private readonly conversation: ConversationService,
  ) {}

  async listConversations(userId: string, timeZone?: string) {
    const rows = await this.prisma.assistantConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { command: true, pending: true },
        },
        _count: { select: { messages: true } },
      },
    });

    const summaries = rows.map((row) => {
      const lastMessage = row.messages[0];
      // status: 'pending' if there's a live in-flight message, otherwise the
      // cached lastMessageStatus, falling back to 'success' for empty chats.
      const status: 'success' | 'error' | 'pending' = lastMessage?.pending
        ? 'pending'
        : (row.lastMessageStatus ?? 'success');
      return {
        id: row.id,
        title: row.title,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        messageCount: row._count.messages,
        preview: trimPreview(lastMessage?.command ?? null),
        status,
        source: row.lastMessageSource ?? null,
      };
    });

    const now = new Date();
    const buckets = new Map<ConversationBucketKey, typeof summaries>();
    for (const summary of summaries) {
      const key = bucketByDate(new Date(summary.updatedAt), now, timeZone);
      const existing = buckets.get(key);
      if (existing) existing.push(summary);
      else buckets.set(key, [summary]);
    }

    const groups = CONVERSATION_BUCKET_ORDER.flatMap((key) => {
      const conversations = buckets.get(key);
      if (!conversations || conversations.length === 0) return [];
      return [{ key, label: CONVERSATION_BUCKET_LABELS[key], conversations }];
    });

    return { groups };
  }

  async createConversation(userId: string) {
    const row = await this.prisma.assistantConversation.create({
      data: { userId },
    });
    return this.toConversationDto(row, []);
  }

  async getConversation(userId: string, conversationId: string) {
    const row = await this.requireConversation(userId, conversationId);
    const messages = await this.prisma.assistantMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
    return this.toConversationDto(row, messages);
  }

  async deleteConversation(userId: string, conversationId: string) {
    await this.requireConversation(userId, conversationId);
    await this.prisma.assistantConversation.delete({ where: { id: conversationId } });
    return { ok: true as const };
  }

  async clearConversations(userId: string) {
    await this.prisma.assistantConversation.deleteMany({ where: { userId } });
    return { ok: true as const };
  }

  async deleteMessage(userId: string, conversationId: string, messageId: string) {
    await this.requireConversation(userId, conversationId);
    const message = await this.prisma.assistantMessage.findFirst({
      where: { id: messageId, conversationId },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    await this.prisma.assistantMessage.delete({ where: { id: messageId } });

    const latest = await this.prisma.assistantMessage.findFirst({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
    });
    await this.prisma.assistantConversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: latest?.createdAt ?? new Date(),
        lastMessageStatus: latest?.status ?? null,
        lastMessageSource: latest?.source ?? null,
      },
    });

    return { ok: true as const };
  }

  /**
   * One-shot JSON entry point. Runs the entire pipeline — prepare,
   * (optional) buffered polish, finalize — and returns the persisted
   * message. Kept as a backward-compatible fallback alongside the new
   * SSE-streaming entry point; both share `prepareCommand` and
   * `finalizeCommand` internally.
   */
  async runCommand(userId: string, conversationId: string, dto: RunAssistantCommandDto) {
    const prep = await this.prepareCommand(userId, conversationId, dto);

    let finalResponse = prep.baseline.response;

    if (prep.mode === 'conversational') {
      // For the JSON path the conversational LLM call runs buffered.
      try {
        const reply = await this.conversation.respond({
          userId: prep.userId,
          userMessage: prep.text,
          history: this.toChatHistory(prep.historyTurns),
          pendingIntent: prep.pendingTask,
        });
        prep.baseline = { ...prep.baseline, response: reply };
        finalResponse = reply;
      } catch {
        const fallback = prep.pendingTask?.question
          ? `I'm here. We were on: ${prep.pendingTask.question}`
          : "I'm here — what would you like to do?";
        prep.baseline = { ...prep.baseline, response: fallback };
        finalResponse = fallback;
      }
    } else if (this.shouldPolish(prep)) {
      const polished = await this.conversation.polishActionResponse({
        userId: prep.userId,
        userMessage: prep.text,
        intent: prep.intent!.intent,
        baseline: prep.baseline.response,
        history: this.toChatHistory(prep.historyTurns),
      });
      if (polished?.trim()) {
        finalResponse = polished;
      }
    }

    return this.finalizeCommand(prep, finalResponse);
  }

  /**
   * Returns true when this prep is a candidate for the LLM polish pass
   * (successful CRM action, no clarifying pendingIntent, non-empty
   * deterministic baseline). The streaming and JSON entry points share
   * this gate so behaviour stays identical when polish is or isn't run.
   */
  shouldPolish(prep: PreparedCommand): boolean {
    return (
      prep.ranActionableIntent &&
      prep.baseline.status === 'success' &&
      !prep.baseline.pendingIntent &&
      !!prep.intent &&
      prep.intent.intent !== 'unknown' &&
      !!prep.baseline.response?.trim()
    );
  }

  /** Flatten executor-side history into role-tagged messages for the polish/respond LLM calls. */
  toChatHistory(historyTurns: ConversationHistoryTurn[]): ConversationTurn[] {
    return historyTurns.flatMap((turn) => [
      { role: 'user' as const, content: turn.command },
      { role: 'assistant' as const, content: turn.response },
    ]);
  }

  /**
   * Pre-polish phase: validate the conversation, create the pending DB
   * row, resolve the intent (synthesised, supplied, or LLM-normalised),
   * and run the executor (CRM action) or the conversational fallback to
   * produce a deterministic baseline response. Returns a snapshot the
   * polish + finalize phases consume.
   */
  async prepareCommand(
    userId: string,
    conversationId: string,
    dto: RunAssistantCommandDto,
  ): Promise<PreparedCommand> {
    const conversation = await this.requireConversation(userId, conversationId);
    const text = dto.text.trim();
    const source: AssistantMessageSource = dto.source === 'voice' ? 'voice' : 'text';

    const pending = await this.prisma.assistantMessage.create({
      data: {
        conversationId,
        command: text,
        response: 'Running your command…',
        status: AssistantMessageStatus.success,
        source,
        transcript: dto.transcript,
        voiceUri: dto.voiceUri,
        pending: true,
      },
    });

    // Reflect the pending row on the conversation so the chat list can show
    // a "running" indicator immediately.
    await this.prisma.assistantConversation
      .update({
        where: { id: conversationId },
        data: { lastMessageStatus: null, lastMessageSource: source },
      })
      .catch((err) => {
        if (!this.isMissingRecordError(err)) throw err;
      });

    const history = await this.prisma.assistantMessage.findMany({
      where: {
        conversationId,
        id: { not: pending.id },
        pending: false,
      },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    });

    const historyTurns: ConversationHistoryTurn[] = history
      .reverse()
      .map((m) => ({ command: m.command, response: m.response }));

    const sessionContext = (conversation.context as AssistantSessionContext | null) ?? {};
    const pendingTask = isPendingIntentValid(sessionContext.pendingIntent ?? null)
      ? sessionContext.pendingIntent ?? null
      : null;

    // The user might be (a) answering a pending question, (b) asking a brand-new
    // CRM action, or (c) just chatting / asking a tangent question. We resolve
    // those three paths in that priority order.
    const tangent = pendingTask ? looksLikeQuestion(text) : false;

    let intent = dto.intent;
    const synthesized =
      pendingTask && !tangent ? this.synthesizePendingIntent(pendingTask, text) : null;
    if (synthesized) {
      intent = synthesized;
    } else if (!tangent && !intent) {
      try {
        intent = await this.voice.interpretWithContext(userId, text, historyTurns, sessionContext);
      } catch {
        // Command service will use heuristics or we'll route to chat below.
      }
    }

    // Route: actionable intent → executor; otherwise → conversational chat.
    // The conversational LLM call is intentionally deferred: the JSON
    // wrapper runs it buffered, the SSE wrapper streams it via
    // ConversationService.respondStream so tokens appear live.
    const hasActionableIntent = !!intent && intent.intent !== 'unknown';
    let baseline: AssistantCommandResult;
    let ranActionableIntent = false;
    let mode: PreparedCommand['mode'];
    if (!tangent && hasActionableIntent) {
      baseline = await this.commands.execute(userId, text, intent!, sessionContext);
      ranActionableIntent = true;
      mode = 'action';
    } else {
      // Placeholder baseline — the wrapper will fill in `response` from
      // the buffered or streaming conversational call.
      baseline = {
        response: '',
        status: 'success',
        intent,
        preservePendingIntent: true,
      };
      mode = 'conversational';
    }

    return {
      userId,
      conversationId,
      conversationTitle: conversation.title,
      pendingMessageId: pending.id,
      text,
      source,
      dto,
      baseline,
      intent,
      ranActionableIntent,
      historyTurns,
      sessionContext,
      mode,
      pendingTask,
    };
  }

  /**
   * SSE-streaming entry point. Mirrors {@link runCommand} but emits the
   * polished assistant reply token-by-token over Server-Sent Events. The
   * stream events are:
   *
   * - `phase`: lifecycle markers (`'normalizing'`, `'thinking'`)
   * - `token`: a content delta to append to the in-flight bubble
   * - `done`: the full persisted message DTO (consumer swaps optimistic IDs)
   *
   * Streaming applies only to LLM-generated phases:
   * - actionable intents that {@link shouldPolish} → `polishActionResponseStream`
   * - conversational fallbacks (tangents / unknown / no-action) → `respondStream`
   *
   * Deterministic short replies (clarifying questions, error states,
   * non-polishable actionable results) are emitted as a single `token`
   * event followed by `done`, matching the existing JSON behaviour.
   */
  runCommandStream(
    userId: string,
    conversationId: string,
    dto: RunAssistantCommandDto,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let cancelled = false;

      const emit = (data: AssistantStreamEvent) => {
        if (cancelled) return;
        subscriber.next({ data });
      };

      void (async () => {
        try {
          emit({ type: 'phase', phase: 'normalizing' });
          const prep = await this.prepareCommand(userId, conversationId, dto);
          if (cancelled) return;

          let accumulated = '';
          const appendDelta = (delta: string) => {
            accumulated += delta;
            emit({ type: 'token', delta });
          };

          if (prep.mode === 'action' && this.shouldPolish(prep)) {
            emit({ type: 'phase', phase: 'thinking' });
            const stream = this.conversation.polishActionResponseStream({
              userId: prep.userId,
              userMessage: prep.text,
              intent: prep.intent!.intent,
              baseline: prep.baseline.response,
              history: this.toChatHistory(prep.historyTurns),
            });
            for await (const delta of stream) {
              if (cancelled) return;
              appendDelta(delta);
            }
          } else if (prep.mode === 'conversational') {
            emit({ type: 'phase', phase: 'thinking' });
            const stream = this.conversation.respondStream({
              userId: prep.userId,
              userMessage: prep.text,
              history: this.toChatHistory(prep.historyTurns),
              pendingIntent: prep.pendingTask,
            });
            for await (const delta of stream) {
              if (cancelled) return;
              appendDelta(delta);
            }
          } else {
            // Action mode without polish (clarifying question, error,
            // unknown intent): emit the deterministic baseline as a
            // single chunk so the FE protocol stays uniform.
            const baselineText = prep.baseline.response;
            if (baselineText) appendDelta(baselineText);
          }

          if (cancelled) return;
          const finalResponse = accumulated.trim() || prep.baseline.response;
          const dtoOut = await this.finalizeCommand(prep, finalResponse);
          if (cancelled) return;
          emit({ type: 'done', message: dtoOut });
          subscriber.complete();
        } catch (err) {
          if (!cancelled) subscriber.error(err);
        }
      })();

      return () => {
        cancelled = true;
      };
    });
  }

  /**
   * Post-polish phase: persist the (possibly polished) response onto the
   * pending DB row, merge session context (contextPatch / pendingIntent /
   * clearPendingIntent), and return the message DTO. Mirrors the original
   * monolithic runCommand's tail half — including the "pending row was
   * deleted mid-flight" recovery path.
   */
  async finalizeCommand(prep: PreparedCommand, finalResponse: string) {
    const result: AssistantCommandResult = {
      ...prep.baseline,
      response: finalResponse,
    };
    const status =
      result.status === 'error'
        ? AssistantMessageStatus.error
        : AssistantMessageStatus.success;

    // The pending row could have been deleted while we were calling the LLM /
    // GHL (e.g. user cleared the conversation mid-flight). Update if possible;
    // otherwise recreate the message so the user still sees a reply.
    const updateData = {
      response: result.response,
      status,
      intent: result.intent ? (result.intent as object) : undefined,
      pending: false,
    };
    let updated: Awaited<ReturnType<typeof this.prisma.assistantMessage.update>>;
    try {
      updated = await this.prisma.assistantMessage.update({
        where: { id: prep.pendingMessageId },
        data: updateData,
      });
    } catch (err) {
      if (!this.isMissingRecordError(err)) throw err;
      const stillExists = await this.prisma.assistantConversation.findFirst({
        where: { id: prep.conversationId, userId: prep.userId },
      });
      if (!stillExists) {
        // Both the pending row AND the conversation were deleted. Return a
        // transient reply so the client doesn't get a 500.
        return this.buildTransientMessageDto(prep.pendingMessageId, prep.text, result, prep.source, prep.dto);
      }
      updated = await this.prisma.assistantMessage.create({
        data: {
          conversationId: prep.conversationId,
          command: prep.text,
          source: prep.source,
          transcript: prep.dto.transcript,
          voiceUri: prep.dto.voiceUri,
          ...updateData,
        },
      });
    }

    const contextPatch = result.contextPatch ?? {};
    const mergedContext: AssistantSessionContext = { ...prep.sessionContext, ...contextPatch };
    if (result.pendingIntent) {
      mergedContext.pendingIntent = result.pendingIntent;
    } else if (result.clearPendingIntent) {
      mergedContext.pendingIntent = null;
    } else if (result.status === 'success' && !result.preservePendingIntent) {
      mergedContext.pendingIntent = null;
    }
    const title =
      prep.conversationTitle ??
      (prep.text.length > 60 ? `${prep.text.slice(0, 57)}…` : prep.text);

    try {
      await this.prisma.assistantConversation.update({
        where: { id: prep.conversationId },
        data: {
          title: prep.conversationTitle ? prep.conversationTitle : title,
          context: mergedContext as Prisma.InputJsonValue,
          updatedAt: new Date(),
          lastMessageStatus: status,
          lastMessageSource: prep.source,
        },
      });
    } catch (err) {
      if (!this.isMissingRecordError(err)) throw err;
      // Conversation was deleted — nothing left to update. Reply is already
      // built; let the response flow back to the client.
    }

    return this.toMessageDto(updated);
  }

  private isMissingRecordError(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025'
    );
  }

  private buildTransientMessageDto(
    id: string,
    text: string,
    result: AssistantCommandResult,
    source: AssistantMessageSource,
    dto: RunAssistantCommandDto,
  ) {
    return this.toMessageDto({
      id,
      command: text,
      response: result.response,
      status:
        result.status === 'error'
          ? AssistantMessageStatus.error
          : AssistantMessageStatus.success,
      source,
      transcript: dto.transcript ?? null,
      intent: result.intent ?? null,
      voiceUri: dto.voiceUri ?? null,
      pending: false,
      createdAt: new Date(),
    });
  }

  /**
   * Given a live pending task and the latest user message, build an intent
   * payload that re-runs the same intent with the new field filled in. Returns
   * null when the message doesn't look like a follow-up answer (e.g. user
   * started a brand-new command), so the LLM is given the chance to take over.
   */
  private synthesizePendingIntent(
    pending: PendingIntent,
    text: string,
  ): VoiceIntentPayload | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const merged = { ...pending.entities };
    const nextMissing = pending.missing[0];

    // Positive confirmation with nothing left to gather → just re-run.
    if (isPositiveConfirmation(trimmed) && pending.missing.length === 0) {
      return {
        intent: pending.intent,
        confidence: 0.95,
        entities: merged,
        needs_clarification: false,
        notes: null,
      };
    }

    // Treat short, non-command replies as the answer to the pending question.
    if (!isFollowUpAnswer(trimmed)) return null;
    if (!nextMissing) {
      // No specific field expected but it looks like a follow-up — just re-run.
      return {
        intent: pending.intent,
        confidence: 0.85,
        entities: merged,
        needs_clarification: false,
        notes: null,
      };
    }

    switch (nextMissing) {
      case 'name':
      case 'opportunityName':
        merged.name = trimmed;
        break;
      case 'pipelineName':
      case 'pipelineId':
        merged.pipelineName = trimmed;
        // The new name supersedes any prior pipelineId guess.
        delete merged.pipelineId;
        break;
      case 'pipelineStageName':
      case 'pipelineStageId':
        merged.pipelineStageName = trimmed;
        break;
      case 'contactName':
        merged.contactName = trimmed;
        delete merged.contactId;
        break;
      case 'monetaryValue': {
        const parsed = parseMonetaryAnswer(trimmed);
        if (parsed === 'skip') {
          merged.monetaryValueSkipped = true;
          delete merged.monetaryValue;
        } else if (parsed === null) {
          // Couldn't read it — let the executor re-ask the same question.
          return null;
        } else {
          merged.monetaryValue = parsed;
          delete merged.monetaryValueSkipped;
        }
        break;
      }
      default:
        // Generic string slot.
        if (isSkipAnswer(trimmed)) {
          // leave as-is; executor will skip this optional field
        } else {
          merged[nextMissing] = trimmed;
        }
    }

    return {
      intent: pending.intent,
      confidence: 0.95,
      entities: merged,
      needs_clarification: false,
      notes: null,
    };
  }

  private async requireConversation(userId: string, conversationId: string) {
    const row = await this.prisma.assistantConversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!row) {
      throw new NotFoundException('Conversation not found');
    }
    return row;
  }

  private toConversationDto(
    row: { id: string; title: string | null; createdAt: Date; updatedAt: Date },
    messages: {
      id: string;
      command: string;
      response: string;
      status: AssistantMessageStatus;
      source: AssistantMessageSource;
      transcript: string | null;
      intent: unknown;
      voiceUri: string | null;
      pending: boolean;
      createdAt: Date;
    }[],
  ) {
    return {
      id: row.id,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      messages: messages.map((m) => this.toMessageDto(m)),
    };
  }

  private toMessageDto(message: {
    id: string;
    command: string;
    response: string;
    status: AssistantMessageStatus;
    source: AssistantMessageSource;
    transcript: string | null;
    intent: unknown;
    voiceUri: string | null;
    pending: boolean;
    createdAt: Date;
  }) {
    return {
      id: message.id,
      command: message.command,
      response: message.response,
      status: message.status,
      source: message.source,
      transcript: message.transcript ?? undefined,
      intent: message.intent ?? undefined,
      voiceUri: message.voiceUri ?? undefined,
      pending: message.pending,
      createdAt: message.createdAt.toISOString(),
    };
  }
}

const PREVIEW_MAX = 140;
function trimPreview(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= PREVIEW_MAX) return trimmed;
  return `${trimmed.slice(0, PREVIEW_MAX - 1)}…`;
}
