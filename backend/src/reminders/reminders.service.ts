import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AssistantMessageSource, Prisma, ReminderStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { SnoozePreset, SnoozeReminderDto } from './dto/snooze-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';

const MAX_ATTEMPTS = 3;
const DISPATCH_BATCH = 50;
const PAST_GRACE_MS = 60_000;
const DEFAULT_OFFSET_MINUTES = 15;
const MAX_OFFSET_MINUTES = 7 * 24 * 60; // one week
const ACTIVE_STATUSES: ReminderStatus[] = [
  ReminderStatus.SCHEDULED,
  ReminderStatus.SNOOZED,
];

export type ListRange = 'today' | 'upcoming' | 'past';

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async create(userId: string, dto: CreateReminderDto) {
    const dueAt = this.parseDueAt(dto.dueAt);
    const remindOffsetMinutes = this.normalizeOffset(dto.remindOffsetMinutes);
    const notifyAt = this.computeNotifyAt(dueAt, remindOffsetMinutes);
    const reminder = await this.prisma.reminder.create({
      data: {
        userId,
        title: dto.title,
        notes: dto.notes ?? null,
        dueAt,
        remindOffsetMinutes,
        notifyAt,
        linkType: dto.linkType ?? null,
        linkProvider: dto.linkProvider ?? null,
        linkExternalId: dto.linkExternalId ?? null,
        linkLabel: dto.linkLabel ?? null,
        source: dto.source ?? AssistantMessageSource.text,
      },
    });
    await this.audit(userId, 'reminder.created', {
      reminderId: reminder.id,
      title: reminder.title,
      dueAt: reminder.dueAt.toISOString(),
      notifyAt: reminder.notifyAt.toISOString(),
    });
    return reminder;
  }

  async list(userId: string, range: ListRange = 'upcoming') {
    const now = new Date();
    const where: Prisma.ReminderWhereInput = { userId };

    if (range === 'today') {
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);
      where.AND = [
        { dueAt: { gte: now } },
        { dueAt: { lte: endOfDay } },
        { status: { in: ACTIVE_STATUSES } },
      ];
    } else if (range === 'upcoming') {
      where.AND = [
        { dueAt: { gte: now } },
        { status: { in: ACTIVE_STATUSES } },
      ];
    } else {
      where.AND = [
        {
          OR: [
            { dueAt: { lt: now } },
            {
              status: {
                in: [
                  ReminderStatus.DELIVERED,
                  ReminderStatus.DISMISSED,
                  ReminderStatus.CANCELED,
                  ReminderStatus.FAILED,
                ],
              },
            },
          ],
        },
      ];
    }

    return this.prisma.reminder.findMany({
      where,
      orderBy: { dueAt: range === 'past' ? 'desc' : 'asc' },
      take: 100,
    });
  }

  async update(userId: string, id: string, dto: UpdateReminderDto) {
    const existing = await this.assertOwned(userId, id);
    const data: Prisma.ReminderUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title;
    if (dto.notes !== undefined) data.notes = dto.notes;
    // Recompute notifyAt whenever the event time or the offset changes, and
    // reset delivery bookkeeping so the (possibly re-scheduled) reminder fires
    // again.
    if (dto.dueAt !== undefined || dto.remindOffsetMinutes !== undefined) {
      const dueAt =
        dto.dueAt !== undefined ? this.parseDueAt(dto.dueAt) : existing.dueAt;
      const remindOffsetMinutes =
        dto.remindOffsetMinutes !== undefined
          ? this.normalizeOffset(dto.remindOffsetMinutes)
          : existing.remindOffsetMinutes;
      data.dueAt = dueAt;
      data.remindOffsetMinutes = remindOffsetMinutes;
      data.notifyAt = this.computeNotifyAt(dueAt, remindOffsetMinutes);
      data.status = ReminderStatus.SCHEDULED;
      data.attempts = 0;
      data.lastError = null;
    }
    if (dto.linkType !== undefined) data.linkType = dto.linkType;
    if (dto.linkProvider !== undefined) data.linkProvider = dto.linkProvider;
    if (dto.linkExternalId !== undefined) data.linkExternalId = dto.linkExternalId;
    if (dto.linkLabel !== undefined) data.linkLabel = dto.linkLabel;

    const updated = await this.prisma.reminder.update({
      where: { id: existing.id },
      data,
    });
    await this.audit(userId, 'reminder.updated', { reminderId: id });
    return updated;
  }

  async snooze(userId: string, id: string, dto: SnoozeReminderDto) {
    await this.assertOwned(userId, id);
    const newDueAt = this.resolveSnoozeTarget(dto);
    const updated = await this.prisma.reminder.update({
      where: { id },
      data: {
        dueAt: newDueAt,
        // A snooze fires exactly at the chosen time, so drop the lead offset.
        notifyAt: newDueAt,
        remindOffsetMinutes: 0,
        snoozedUntil: newDueAt,
        status: ReminderStatus.SNOOZED,
        attempts: 0,
        lastError: null,
      },
    });
    await this.audit(userId, 'reminder.snoozed', {
      reminderId: id,
      until: newDueAt.toISOString(),
    });
    return updated;
  }

  async dismiss(userId: string, id: string) {
    await this.assertOwned(userId, id);
    const updated = await this.prisma.reminder.update({
      where: { id },
      data: { status: ReminderStatus.DISMISSED },
    });
    await this.audit(userId, 'reminder.dismissed', { reminderId: id });
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.assertOwned(userId, id);
    await this.prisma.reminder.delete({ where: { id } });
    await this.audit(userId, 'reminder.deleted', { reminderId: id });
  }

  async dispatchDueReminders(): Promise<{ delivered: number; failed: number }> {
    const due = await this.prisma.reminder.findMany({
      where: {
        status: { in: ACTIVE_STATUSES },
        notifyAt: { lte: new Date() },
        attempts: { lt: MAX_ATTEMPTS },
      },
      orderBy: { notifyAt: 'asc' },
      take: DISPATCH_BATCH,
    });

    let delivered = 0;
    let failed = 0;

    for (const r of due) {
      const result = await this.push.sendToUser(r.userId, {
        title: r.title,
        body: r.notes ?? 'Reminder is due',
        data: {
          reminderId: r.id,
          linkType: r.linkType,
          linkProvider: r.linkProvider,
          linkExternalId: r.linkExternalId,
        },
        channelId: 'reminders',
      });

      if (result.sent) {
        await this.prisma.reminder.update({
          where: { id: r.id },
          data: {
            status: ReminderStatus.DELIVERED,
            deliveredAt: new Date(),
            attempts: { increment: 1 },
          },
        });
        await this.audit(r.userId, 'reminder.delivered', {
          reminderId: r.id,
          ticketId: result.ticketId,
        });
        delivered++;
      } else {
        const nextAttempts = r.attempts + 1;
        const exhausted = nextAttempts >= MAX_ATTEMPTS;
        await this.prisma.reminder.update({
          where: { id: r.id },
          data: {
            attempts: nextAttempts,
            lastError: result.reason,
            status: exhausted ? ReminderStatus.FAILED : r.status,
          },
        });
        if (exhausted) {
          await this.audit(r.userId, 'reminder.failed', {
            reminderId: r.id,
            reason: result.reason,
          });
        }
        failed++;
      }
    }

    return { delivered, failed };
  }

  private parseDueAt(raw: string): Date {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('dueAt is not a valid ISO 8601 date');
    }
    if (d.getTime() < Date.now() - PAST_GRACE_MS) {
      throw new BadRequestException('dueAt is in the past');
    }
    return d;
  }

  private normalizeOffset(raw: number | undefined): number {
    if (raw === undefined || raw === null) return DEFAULT_OFFSET_MINUTES;
    if (!Number.isFinite(raw) || raw < 0) {
      throw new BadRequestException('remindOffsetMinutes must be >= 0');
    }
    return Math.min(Math.round(raw), MAX_OFFSET_MINUTES);
  }

  // The notification fires `offset` minutes before the event. If that instant is
  // already in the past (the reminder was created inside the lead window), fall
  // back to firing exactly at the event time.
  private computeNotifyAt(dueAt: Date, offsetMinutes: number): Date {
    const candidate = new Date(dueAt.getTime() - offsetMinutes * 60_000);
    return candidate.getTime() <= Date.now() ? dueAt : candidate;
  }

  private resolveSnoozeTarget(dto: SnoozeReminderDto): Date {
    if (dto.snoozeUntil) return this.parseDueAt(dto.snoozeUntil);
    if (dto.preset) return this.presetToDate(dto.preset);
    throw new BadRequestException('Provide snoozeUntil or preset');
  }

  private presetToDate(preset: SnoozePreset): Date {
    const now = new Date();
    if (preset === '10m') return new Date(now.getTime() + 10 * 60_000);
    if (preset === '1h') return new Date(now.getTime() + 60 * 60_000);
    if (preset === 'tomorrow9') {
      const t = new Date(now);
      t.setDate(t.getDate() + 1);
      t.setHours(9, 0, 0, 0);
      return t;
    }
    throw new BadRequestException(`Unknown preset: ${preset as string}`);
  }

  private async assertOwned(userId: string, id: string) {
    const existing = await this.prisma.reminder.findFirst({
      where: { id, userId },
    });
    if (!existing) throw new NotFoundException('Reminder not found');
    return existing;
  }

  private async audit(
    userId: string,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action,
          payload: payload as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Audit log write failed for ${action}: ${(err as Error).message}`,
      );
    }
  }
}
