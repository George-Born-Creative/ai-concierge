import { Injectable, NotFoundException } from '@nestjs/common';
import { AssistantMessageSource, AssistantMessageStatus, Prisma } from '@prisma/client';

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
  PendingIntent,
  VoiceIntentPayload,
} from './assistant.types';
import { RunAssistantCommandDto } from './dto/run-command.dto';

const HISTORY_LIMIT = 15;

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

  async runCommand(userId: string, conversationId: string, dto: RunAssistantCommandDto) {
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

    const historyTurns = history
      .reverse()
      .map((m) => ({ command: m.command, response: m.response }));

    const sessionContext = (conversation.context as AssistantSessionContext | null) ?? {};
    const pending2 = isPendingIntentValid(sessionContext.pendingIntent ?? null)
      ? sessionContext.pendingIntent ?? null
      : null;

    // The user might be (a) answering a pending question, (b) asking a brand-new
    // CRM action, or (c) just chatting / asking a tangent question. We resolve
    // those three paths in that priority order.
    const tangent = pending2 ? looksLikeQuestion(text) : false;

    let intent = dto.intent;
    const synthesized =
      pending2 && !tangent ? this.synthesizePendingIntent(pending2, text) : null;
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
    const hasActionableIntent = !!intent && intent.intent !== 'unknown';
    let result: AssistantCommandResult;
    let ranActionableIntent = false;
    if (!tangent && hasActionableIntent) {
      result = await this.commands.execute(userId, text, intent, sessionContext);
      ranActionableIntent = true;
    } else {
      result = await this.respondConversationally(userId, text, historyTurns, pending2, intent);
    }

    // After a successful CRM action, rewrite the deterministic baseline
    // response in concierge tone via gpt-4o-mini. The LLM is given the
    // factual baseline as ground truth and is forbidden from inventing or
    // changing facts (names, ids, numbers); on any failure it falls back
    // to the baseline so the user always sees a reply.
    //
    // Only polish when:
    // - we actually ran an action (not the conversational fallback, which is
    //   already an LLM reply),
    // - the action succeeded,
    // - there's no pendingIntent on the result (those are clarifying
    //   questions like "what should I name it?" — keep them deterministic),
    // - the action wasn't an unknown / no-op fallthrough.
    if (
      ranActionableIntent &&
      result.status === 'success' &&
      !result.pendingIntent &&
      intent &&
      intent.intent !== 'unknown' &&
      result.response?.trim()
    ) {
      const polished = await this.conversation.polishActionResponse({
        userId,
        userMessage: text,
        intent: intent.intent,
        baseline: result.response,
        history: historyTurns.flatMap((turn) => [
          { role: 'user' as const, content: turn.command },
          { role: 'assistant' as const, content: turn.response },
        ]),
      });
      if (polished?.trim()) {
        result = { ...result, response: polished };
      }
    }

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
        where: { id: pending.id },
        data: updateData,
      });
    } catch (err) {
      if (!this.isMissingRecordError(err)) throw err;
      const stillExists = await this.prisma.assistantConversation.findFirst({
        where: { id: conversationId, userId },
      });
      if (!stillExists) {
        // Both the pending row AND the conversation were deleted. Return a
        // transient reply so the client doesn't get a 500.
        return this.buildTransientMessageDto(pending.id, text, result, source, dto);
      }
      updated = await this.prisma.assistantMessage.create({
        data: {
          conversationId,
          command: text,
          source,
          transcript: dto.transcript,
          voiceUri: dto.voiceUri,
          ...updateData,
        },
      });
    }

    const contextPatch = result.contextPatch ?? {};
    const mergedContext: AssistantSessionContext = { ...sessionContext, ...contextPatch };
    if (result.pendingIntent) {
      mergedContext.pendingIntent = result.pendingIntent;
    } else if (result.clearPendingIntent) {
      mergedContext.pendingIntent = null;
    } else if (result.status === 'success' && !result.preservePendingIntent) {
      mergedContext.pendingIntent = null;
    }
    const title =
      conversation.title ??
      (text.length > 60 ? `${text.slice(0, 57)}…` : text);

    try {
      await this.prisma.assistantConversation.update({
        where: { id: conversationId },
        data: {
          title: conversation.title ? conversation.title : title,
          context: mergedContext as Prisma.InputJsonValue,
          updatedAt: new Date(),
          lastMessageStatus: status,
          lastMessageSource: source,
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
   * Conversational fallback: produce a natural reply via ChatGPT. Preserves an
   * in-flight pending intent so a tangent doesn't drop the user's workflow.
   */
  private async respondConversationally(
    userId: string,
    text: string,
    historyTurns: { command: string; response: string }[],
    pending: PendingIntent | null,
    intent: VoiceIntentPayload | undefined,
  ): Promise<AssistantCommandResult> {
    // Flatten the prior turns into role-based messages for the chat completion.
    const chatHistory = historyTurns.flatMap((turn) => [
      { role: 'user' as const, content: turn.command },
      { role: 'assistant' as const, content: turn.response },
    ]);

    try {
      const reply = await this.conversation.respond({
        userId,
        userMessage: text,
        history: chatHistory,
        pendingIntent: pending,
      });
      return {
        response: reply,
        status: 'success',
        intent,
        preservePendingIntent: true,
      };
    } catch {
      return {
        response: pending?.question
          ? `I'm here. We were on: ${pending.question}`
          : "I'm here — what would you like to do?",
        status: 'success',
        intent,
        preservePendingIntent: true,
      };
    }
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
