import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AssistantMessageSource,
  CrmProvider,
  ReminderLinkType,
  ReminderStatus,
} from '@prisma/client';

import { GhlService } from '../integrations/ghl/ghl.service';
import { PrismaService } from '../prisma/prisma.service';

// How many minutes before an appointment's start time the reminder should fire.
// Overridable via env; defaults to 15.
const DEFAULT_LEAD_MINUTES = 15;
// How far ahead we pull appointments to pre-create reminders for. Appointments
// further out get picked up on a later run once they enter this window.
const LOOKAHEAD_DAYS = 3;

const ACTIVE_STATUSES: ReminderStatus[] = [
  ReminderStatus.SCHEDULED,
  ReminderStatus.SNOOZED,
];

// Suffix appended to the appointment id to key the "at start time" reminder,
// keeping it distinct from the lead-time heads-up reminder (keyed on the bare id).
const AT_SUFFIX = '#at';

type AppointmentReminderSpec = {
  extId: string;
  dueAt: Date;
  notifyAt: Date;
  offset: number;
  title: string;
  notes: string;
};

/**
 * Mirrors upcoming GoHighLevel calendar appointments into Reminder rows so the
 * user gets a heads-up notification/alarm before each meeting.
 *
 * Runs on a schedule, and for every user with an enabled GHL connection:
 *   - pulls the next {@link LOOKAHEAD_DAYS} days of appointments,
 *   - upserts one reminder per appointment (`dueAt = startTime - lead`),
 *   - keeps `dueAt`/title in sync if the appointment moves,
 *   - cancels the reminder if the appointment is cancelled.
 *
 * Reminders are keyed to an appointment via
 * (`linkType=APPOINTMENT`, `linkProvider=GHL`, `linkExternalId=<appt id>`), so a
 * given appointment never produces duplicate reminders. Dispatch itself is
 * handled by the existing reminders cron + push/local-notification pipeline.
 */
@Injectable()
export class AppointmentReminderSyncService {
  private readonly logger = new Logger(AppointmentReminderSyncService.name);
  private readonly leadMinutes: number;
  // Guards against overlapping runs if a sync takes longer than the interval.
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ghl: GhlService,
    private readonly config: ConfigService,
  ) {
    const raw = Number(
      this.config.get<string>('APPOINTMENT_REMINDER_LEAD_MINUTES'),
    );
    this.leadMinutes = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_LEAD_MINUTES;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const connections = await this.prisma.integrationConnection.findMany({
        where: { provider: CrmProvider.GHL, enabled: true },
        select: { userId: true },
      });

      let created = 0;
      let updated = 0;
      let canceled = 0;
      for (const { userId } of connections) {
        try {
          const result = await this.syncUser(userId);
          created += result.created;
          updated += result.updated;
          canceled += result.canceled;
        } catch (err) {
          // One user's GHL hiccup (revoked token, no location, rate limit)
          // shouldn't stop the rest.
          this.logger.warn(
            `Appointment sync failed for user ${userId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      if (created > 0 || updated > 0 || canceled > 0) {
        this.logger.log(
          `appointment sync - created=${created} updated=${updated} canceled=${canceled}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Appointment sync tick failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  private async syncUser(
    userId: string,
  ): Promise<{ created: number; updated: number; canceled: number }> {
    const { appointments } = await this.ghl.listCalendarEvents(userId, {
      days: LOOKAHEAD_DAYS,
    });

    let created = 0;
    let updated = 0;
    let canceled = 0;
    if (appointments.length === 0) {
      return { created, updated, canceled };
    }

    // We create up to two reminders per appointment: a lead-time heads-up
    // (`<id>`) and an at-start alert (`<id>#at`). Look both up so we can
    // dedupe / update / cancel instead of creating duplicates.
    const ids = appointments
      .filter((a) => a.id)
      .flatMap((a) => [a.id, `${a.id}${AT_SUFFIX}`]);
    const existing = await this.prisma.reminder.findMany({
      where: {
        userId,
        linkType: ReminderLinkType.APPOINTMENT,
        linkProvider: CrmProvider.GHL,
        linkExternalId: { in: ids },
      },
    });
    const byExternalId = new Map(existing.map((r) => [r.linkExternalId, r]));

    const now = Date.now();
    for (const appt of appointments) {
      if (!appt.id || !appt.startTime) continue;
      const startMs = Date.parse(appt.startTime);
      if (Number.isNaN(startMs)) continue;

      const isCancelled = /cancel/i.test(appt.status ?? '');

      // Appointment was cancelled → cancel any active reminders we made for it.
      if (isCancelled) {
        for (const extId of [appt.id, `${appt.id}${AT_SUFFIX}`]) {
          const row = byExternalId.get(extId);
          if (row && ACTIVE_STATUSES.includes(row.status)) {
            await this.prisma.reminder.update({
              where: { id: row.id },
              data: { status: ReminderStatus.CANCELED },
            });
            canceled++;
          }
        }
        continue;
      }

      // Appointment already started/past — nothing to remind about.
      if (startMs <= now) continue;

      const title = appt.title?.trim() || 'Appointment';
      const startLabel = this.formatStart(appt.startTime);
      const dueAt = new Date(startMs);

      // At-start alert: always fire exactly when the appointment begins.
      const specs: AppointmentReminderSpec[] = [
        {
          extId: `${appt.id}${AT_SUFFIX}`,
          dueAt,
          notifyAt: dueAt,
          offset: 0,
          title,
          notes: `Now: ${startLabel}`,
        },
      ];

      // Lead-time heads-up: only when there's a real window before the start
      // (otherwise it would collide with the at-start alert above).
      const leadNotifyMs = startMs - this.leadMinutes * 60_000;
      if (this.leadMinutes > 0 && leadNotifyMs > now) {
        specs.push({
          extId: appt.id,
          dueAt,
          notifyAt: new Date(leadNotifyMs),
          offset: this.leadMinutes,
          title: `Upcoming: ${title}`,
          notes: `Starts at ${startLabel}`,
        });
      }

      for (const spec of specs) {
        const row = byExternalId.get(spec.extId);
        if (!row) {
          await this.prisma.reminder.create({
            data: {
              userId,
              title: spec.title,
              notes: spec.notes,
              dueAt: spec.dueAt,
              remindOffsetMinutes: spec.offset,
              notifyAt: spec.notifyAt,
              status: ReminderStatus.SCHEDULED,
              linkType: ReminderLinkType.APPOINTMENT,
              linkProvider: CrmProvider.GHL,
              linkExternalId: spec.extId,
              linkLabel: title,
              source: AssistantMessageSource.text,
            },
          });
          created++;
          continue;
        }

        // Only touch reminders we haven't fired/handled yet, and only when the
        // appointment actually moved — avoids resurrecting dismissed reminders
        // and needless writes.
        if (
          ACTIVE_STATUSES.includes(row.status) &&
          Math.abs(row.notifyAt.getTime() - spec.notifyAt.getTime()) > 60_000
        ) {
          await this.prisma.reminder.update({
            where: { id: row.id },
            data: {
              dueAt: spec.dueAt,
              notifyAt: spec.notifyAt,
              remindOffsetMinutes: spec.offset,
              title: spec.title,
              notes: spec.notes,
              attempts: 0,
              lastError: null,
            },
          });
          updated++;
        }
      }
    }

    return { created, updated, canceled };
  }

  // Format the appointment start using the wall-clock time GHL reports, without
  // shifting it into the server's timezone.
  private formatStart(iso: string): string {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    const d = m
      ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
      : new Date(iso);
    if (Number.isNaN(d.getTime())) return 'the scheduled time';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}
