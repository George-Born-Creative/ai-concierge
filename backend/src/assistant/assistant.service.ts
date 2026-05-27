import { Injectable, NotFoundException } from '@nestjs/common';
import { AssistantMessageSource, AssistantMessageStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { VoiceService } from '../voice/voice.service';
import { AssistantCommandService } from './assistant-command.service';
import type { AssistantSessionContext } from './assistant.types';
import { RunAssistantCommandDto } from './dto/run-command.dto';

const HISTORY_LIMIT = 15;

@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: AssistantCommandService,
    private readonly voice: VoiceService,
  ) {}

  async listConversations(userId: string) {
    const rows = await this.prisma.assistantConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: { select: { messages: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      messageCount: row._count.messages,
      preview: row.messages[0]?.command ?? null,
    }));
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
      data: { updatedAt: latest?.createdAt ?? new Date() },
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

    let intent = dto.intent;
    if (!intent) {
      try {
        intent = await this.voice.interpretWithContext(userId, text, historyTurns, sessionContext);
      } catch {
        // Command service will use heuristics.
      }
    }

    const result = await this.commands.execute(userId, text, intent, sessionContext);

    const status =
      result.status === 'error'
        ? AssistantMessageStatus.error
        : AssistantMessageStatus.success;

    const updated = await this.prisma.assistantMessage.update({
      where: { id: pending.id },
      data: {
        response: result.response,
        status,
        intent: result.intent ? (result.intent as object) : undefined,
        pending: false,
      },
    });

    const contextPatch = result.contextPatch ?? {};
    const mergedContext = { ...sessionContext, ...contextPatch };
    const title =
      conversation.title ??
      (text.length > 60 ? `${text.slice(0, 57)}…` : text);

    await this.prisma.assistantConversation.update({
      where: { id: conversationId },
      data: {
        title: conversation.title ? conversation.title : title,
        context: mergedContext as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });

    return this.toMessageDto(updated);
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
