import { ForbiddenException, Injectable } from '@nestjs/common';

import { GhlService } from '../integrations/ghl/ghl.service';
import {
  extractAppointmentCancelQuery,
  extractAppointmentDetails,
  extractAppointmentRange,
  extractCalendarCreateDetails,
  extractCalendarQuery,
  extractCalendarUpdateDetails,
  extractCreateDetails,
  extractFreeSlotsDetails,
  extractSearchQuery,
  mergeSessionIntoEntities,
  shouldRunIntent
} from './assistant-command.helpers';
import type {
  AssistantCommandResult,
  AssistantSessionContext,
  VoiceIntentPayload,
} from './assistant.types';

@Injectable()
export class AssistantCommandService {
  constructor(private readonly ghl: GhlService) {}

  async execute(
    userId: string,
    command: string,
    intent?: VoiceIntentPayload,
    sessionContext?: AssistantSessionContext | null,
  ): Promise<AssistantCommandResult> {
    const normalized = command.trim();
    if (!normalized) {
      return {
        response: 'Tell me what you want to do with contacts or your calendar.',
        status: 'error',
      };
    }

    try {
      let resolved = intent;
      if (resolved && sessionContext) {
        resolved = {
          ...resolved,
          entities: mergeSessionIntoEntities(resolved.entities, sessionContext),
        };
      }

      if (resolved?.needs_clarification && resolved.notes) {
        return { response: resolved.notes, status: 'error', intent: resolved };
      }

      if (resolved && shouldRunIntent(resolved)) {
        const fromIntent = await this.executeFromIntent(userId, resolved);
        if (fromIntent) return fromIntent;
      }

      return this.executeWithHeuristics(userId, normalized);
    } catch (error) {
      return {
        response: this.ghlErrorMessage(error),
        status: 'error',
        intent,
      };
    }
  }

  private async executeFromIntent(
    userId: string,
    intent: VoiceIntentPayload,
  ): Promise<AssistantCommandResult | null> {
    switch (intent.intent) {
      case 'list_contacts':
        return this.listLatestContacts(userId);
      case 'find_contact':
        return this.findContactByQuery(userId, extractSearchQuery(intent.entities));
      case 'create_contact':
        return this.createContactFromDetails(userId, extractCreateDetails(intent.entities));
      case 'delete_contact':
        return this.deleteContactByQuery(userId, extractSearchQuery(intent.entities));
      case 'list_calendars':
        return this.listCalendars(userId);
      case 'get_calendar':
        return this.getCalendarByQuery(userId, extractCalendarQuery(intent.entities));
      case 'create_calendar':
        return this.createCalendarFromDetails(userId, extractCalendarCreateDetails(intent.entities));
      case 'update_calendar':
        return this.updateCalendarFromDetails(userId, extractCalendarUpdateDetails(intent.entities));
      case 'delete_calendar':
        return this.deleteCalendarByQuery(userId, extractCalendarQuery(intent.entities));
      case 'get_free_slots':
        return this.getFreeSlotsFromDetails(userId, extractFreeSlotsDetails(intent.entities));
      case 'list_appointments':
        return this.listUpcomingAppointments(userId, extractAppointmentRange(intent.entities));
      case 'create_appointment':
        return this.createAppointmentFromDetails(userId, extractAppointmentDetails(intent.entities));
      case 'cancel_appointment':
        return this.cancelAppointmentByQuery(userId, extractAppointmentCancelQuery(intent.entities));
      default:
        return null;
    }
  }

  private async executeWithHeuristics(userId: string, command: string): Promise<AssistantCommandResult> {
    const lower = command.toLowerCase();
    if (/\bcalendar(s)?\b/.test(lower) && /\b(list|show|what|my|which|got)\b/.test(lower)) {
      return this.listCalendars(userId);
    }
    if (/\b(appointment|meeting|schedule|calendar)\b/.test(lower) && /\b(upcoming|today|tomorrow|this week|on my|what's|whats|show|list|any)\b/.test(lower)) {
      return this.listUpcomingAppointments(userId);
    }
    if (/\b(contacts?|people|leads|clients)\b/.test(lower) && /\b(list|show|pull up|get|see|recent|latest|my|all|who)\b/.test(lower)) {
      return this.listLatestContacts(userId);
    }
    return {
      response:
        'I can handle contacts and calendars in GoHighLevel. Try "pull up my contacts", "what\'s on my calendar", or "book Sarah tomorrow at 2pm".',
      status: 'error',
    };
  }

  private async listLatestContacts(userId: string): Promise<AssistantCommandResult> {
    const result = await this.ghl.listContacts(userId, 10);
    const summaries = result.contacts.filter((c) => c.name !== 'Unknown');
    if (summaries.length === 0) {
      return { response: "You don't have any contacts in GoHighLevel yet.", status: 'success' };
    }
    return {
      response: `Here's who you've got recently:\n${summaries.map((c) => this.formatContact(c)).join('\n')}`,
      status: 'success',
    };
  }

  private async findContactByQuery(userId: string, query: string): Promise<AssistantCommandResult> {
    if (!query) {
      return { response: 'Who are you looking for? A name, phone, or email works.', status: 'error' };
    }
    const matches = await this.findMatchingContacts(userId, query);
    if (matches.length === 0) {
      return { response: `No one in GoHighLevel matches "${query}".`, status: 'error' };
    }
    const top = matches[0];
    return {
      response:
        matches.length === 1
          ? `Found them:\n${this.formatContact(top)}`
          : `Found ${matches.length} people:\n${matches.slice(0, 5).map((c) => this.formatContact(c)).join('\n')}`,
      status: 'success',
      contextPatch: { lastContactId: top.id, lastContactName: top.name },
    };
  }

  private async createContactFromDetails(
    userId: string,
    details: ReturnType<typeof extractCreateDetails>,
  ): Promise<AssistantCommandResult> {
    if (!details.name || (!details.phone && !details.email)) {
      return {
        response: 'I need a name and either a phone number or email.',
        status: 'error',
      };
    }
    const parts = details.name.trim().split(/\s+/);
    const firstName = parts[0];
    const lastName = parts.length > 1 ? parts.slice(1).join(' ') : undefined;
    const created = await this.ghl.createContact(userId, {
      name: details.name,
      firstName,
      lastName,
      phone: details.phone,
      email: details.email,
    });
    const bits = [created.phone ? `phone ${created.phone}` : null, created.email ? `email ${created.email}` : null]
      .filter(Boolean)
      .join(', ');
    return {
      response: `Added ${created.name}${bits ? ` (${bits})` : ''} to GoHighLevel.`,
      status: 'success',
      contextPatch: { lastContactId: created.id, lastContactName: created.name },
    };
  }

  private async deleteContactByQuery(userId: string, query: string): Promise<AssistantCommandResult> {
    if (!query) {
      return { response: 'Who should I remove? Give me a name, phone, or email.', status: 'error' };
    }
    const matches = await this.findMatchingContacts(userId, query);
    if (matches.length === 0) {
      return { response: `No one matches "${query}".`, status: 'error' };
    }
    if (matches.length > 1) {
      return {
        response: `Which one?\n${matches.slice(0, 5).map((c) => this.formatContact(c)).join('\n')}`,
        status: 'error',
      };
    }
    await this.ghl.deleteContact(userId, matches[0].id);
    return { response: `Removed ${matches[0].name} from GoHighLevel.`, status: 'success' };
  }

  private async listCalendars(userId: string): Promise<AssistantCommandResult> {
    const result = await this.ghl.listCalendars(userId);
    if (result.calendars.length === 0) {
      return { response: "You don't have any calendars set up in GoHighLevel yet.", status: 'success' };
    }
    return {
      response: `Here are your calendars:\n${result.calendars.map((c) => this.formatCalendar(c)).join('\n')}`,
      status: 'success',
    };
  }

  private async getCalendarByQuery(userId: string, query: string): Promise<AssistantCommandResult> {
    if (!query.trim()) {
      return { response: 'Which calendar? Give me a name or ID.', status: 'error' };
    }
    const calendarId = await this.resolveCalendarId(userId, undefined, query);
    const calendar = await this.ghl.getCalendar(userId, calendarId);
    return {
      response: `Calendar: ${calendar.name}${calendar.isActive === false ? ' (inactive)' : ''} (id ${calendar.id})`,
      status: 'success',
      contextPatch: { lastCalendarId: calendar.id, lastCalendarName: calendar.name },
    };
  }

  private async createCalendarFromDetails(
    userId: string,
    details: ReturnType<typeof extractCalendarCreateDetails>,
  ): Promise<AssistantCommandResult> {
    if (!details.name) {
      return { response: 'What should I name the new calendar?', status: 'error' };
    }
    const created = await this.ghl.createCalendar(userId, {
      name: details.name,
      description: details.description,
      isActive: details.isActive,
    });
    return {
      response: `Created calendar "${created.name}" (id ${created.id}).`,
      status: 'success',
      contextPatch: { lastCalendarId: created.id, lastCalendarName: created.name },
    };
  }

  private async updateCalendarFromDetails(
    userId: string,
    details: ReturnType<typeof extractCalendarUpdateDetails>,
  ): Promise<AssistantCommandResult> {
    if (!details.calendarId && !details.calendarName) {
      return { response: 'Which calendar should I update?', status: 'error' };
    }
    const calendarId = await this.resolveCalendarId(userId, details.calendarId, details.calendarName);
    const updated = await this.ghl.updateCalendar(userId, calendarId, {
      name: details.name,
      description: details.description,
      isActive: details.isActive,
    });
    return {
      response: `Updated calendar "${updated.name}".`,
      status: 'success',
      contextPatch: { lastCalendarId: updated.id, lastCalendarName: updated.name },
    };
  }

  private async deleteCalendarByQuery(userId: string, query: string): Promise<AssistantCommandResult> {
    if (!query.trim()) {
      return { response: 'Which calendar should I delete?', status: 'error' };
    }
    const calendarId = await this.resolveCalendarId(userId, undefined, query);
    const calendar = await this.ghl.getCalendar(userId, calendarId);
    await this.ghl.deleteCalendar(userId, calendarId);
    return { response: `Deleted calendar "${calendar.name}".`, status: 'success' };
  }

  private async getFreeSlotsFromDetails(
    userId: string,
    details: ReturnType<typeof extractFreeSlotsDetails>,
  ): Promise<AssistantCommandResult> {
    const calendarId = await this.resolveCalendarId(userId, details.calendarId, details.calendarName);
    const startDate = details.startDate ?? Date.now();
    const endDate = details.endDate ?? startDate + (details.days ?? 7) * 24 * 60 * 60 * 1000;
    const slots = await this.ghl.getCalendarFreeSlots(userId, calendarId, {
      startDate,
      endDate,
      timezone: details.timezone,
      userId: details.userId,
    });
    const summary = this.formatFreeSlots(slots);
    if (!summary) {
      return { response: 'No free slots in that range.', status: 'success' };
    }
    return { response: `Available slots:\n${summary}`, status: 'success' };
  }

  private async listUpcomingAppointments(
    userId: string,
    range?: ReturnType<typeof extractAppointmentRange>,
  ): Promise<AssistantCommandResult> {
    const result = await this.ghl.listCalendarEvents(userId, {
      startTime: range?.startTime,
      endTime: range?.endTime,
      days: range?.days ?? 14,
    });
    if (result.appointments.length === 0) {
      return { response: 'Nothing on the calendar for that window.', status: 'success' };
    }
    const top = result.appointments[0];
    return {
      response: `Here's what's coming up:\n${result.appointments
        .slice(0, 10)
        .map((a) => this.formatAppointment(a))
        .join('\n')}`,
      status: 'success',
      contextPatch: top
        ? {
            lastAppointmentId: top.id,
            lastAppointmentTitle: top.title,
            lastCalendarId: top.calendarId,
          }
        : undefined,
    };
  }

  private async createAppointmentFromDetails(
    userId: string,
    details: ReturnType<typeof extractAppointmentDetails>,
  ): Promise<AssistantCommandResult> {
    if (!details.startTime) {
      return {
        response: 'When should it be? Give me a day and time, like "tomorrow at 2pm".',
        status: 'error',
      };
    }
    if (!details.contactName && !details.contactId) {
      return { response: 'Who is the appointment with?', status: 'error' };
    }
    const created = await this.ghl.createAppointment(userId, {
      contactId: details.contactId,
      contactName: details.contactName,
      calendarId: details.calendarId,
      calendarName: details.calendarName,
      startTime: details.startTime,
      endTime: details.endTime,
      durationMinutes: details.durationMinutes,
      title: details.title,
      notes: details.notes,
    });
    return {
      response: `Booked — ${created.title} ${this.formatWhen(created.startTime)}.`,
      status: 'success',
      contextPatch: {
        lastAppointmentId: created.id,
        lastAppointmentTitle: created.title,
        lastCalendarId: created.calendarId,
        lastContactId: created.contactId,
      },
    };
  }

  private async cancelAppointmentByQuery(userId: string, query: string): Promise<AssistantCommandResult> {
    if (!query.trim()) {
      return { response: 'Which appointment should I cancel? A name or time helps.', status: 'error' };
    }
    const result = await this.ghl.listCalendarEvents(userId, { days: 30 });
    const matches = this.findMatchingAppointments(result.appointments, query);
    if (matches.length === 0) {
      return { response: `Couldn't find an appointment matching "${query}".`, status: 'error' };
    }
    await this.ghl.cancelAppointment(userId, matches[0].id);
    return {
      response: `Canceled ${matches[0].title} ${this.formatWhen(matches[0].startTime)}.`,
      status: 'success',
    };
  }

  private async findMatchingContacts(userId: string, query: string) {
    const result = await this.ghl.listContacts(userId, 20, query);
    const searchableQuery = this.normalizeSearch(query);
    return result.contacts.filter((contact) => {
      const haystack = this.normalizeSearch(
        [contact.name, contact.phone, contact.email].filter(Boolean).join(' '),
      );
      return haystack.includes(searchableQuery);
    });
  }

  private async resolveCalendarId(userId: string, calendarId?: string, calendarName?: string) {
    if (calendarId?.trim()) return calendarId.trim();
    const { calendars } = await this.ghl.listCalendars(userId);
    if (calendars.length === 0) {
      throw new Error('No calendars found in GoHighLevel');
    }
    const query = calendarName?.trim().toLowerCase();
    if (query) {
      const match = calendars.find((c) => c.name.toLowerCase().includes(query));
      if (match) return match.id;
      throw new Error(`No calendar matching "${calendarName}"`);
    }
    const active = calendars.find((c) => c.isActive !== false);
    return (active ?? calendars[0]).id;
  }

  private findMatchingAppointments(
    appointments: { id: string; title: string; startTime?: string; endTime?: string }[],
    query: string,
  ) {
    const searchableQuery = this.normalizeSearch(query);
    return appointments.filter((appointment) => {
      const haystack = this.normalizeSearch(
        [appointment.title, appointment.startTime, appointment.endTime].filter(Boolean).join(' '),
      );
      return haystack.includes(searchableQuery);
    });
  }

  private formatContact(contact: { name: string; phone?: string; email?: string }) {
    const detail = [contact.phone, contact.email].filter(Boolean).join(' · ');
    return detail ? `· ${contact.name} — ${detail}` : `· ${contact.name}`;
  }

  private formatCalendar(calendar: { name: string; isActive?: boolean }) {
    return calendar.isActive === false ? `· ${calendar.name} (inactive)` : `· ${calendar.name}`;
  }

  private formatAppointment(appointment: { title: string; startTime?: string }) {
    const when = this.formatWhen(appointment.startTime);
    return when ? `· ${appointment.title} — ${when}` : `· ${appointment.title}`;
  }

  private formatWhen(iso?: string) {
    if (!iso) return '';
    const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (match) {
      const d = new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
      );
      return d.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    }
    const time = Date.parse(iso);
    if (Number.isNaN(time)) return iso;
    return new Date(time).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  private formatFreeSlots(payload: Record<string, unknown>): string {
    const lines: string[] = [];
    const dated = payload as Record<string, { slots?: { start?: string }[] }>;
    for (const [day, value] of Object.entries(dated)) {
      if (day === 'traceId') continue;
      const daySlots = value?.slots ?? [];
      if (!Array.isArray(daySlots) || daySlots.length === 0) continue;
      const times = daySlots
        .slice(0, 8)
        .map((slot) => (slot.start ? this.formatWhen(String(slot.start)) : 'slot'))
        .join(', ');
      lines.push(`· ${day}: ${times}`);
      if (lines.length >= 7) break;
    }
    return lines.join('\n');
  }

  private normalizeSearch(value: string) {
    return value.toLowerCase().replace(/[^\p{L}\p{N}@]+/gu, '');
  }

  private ghlErrorMessage(error: unknown): string {
    if (error instanceof ForbiddenException) {
      const message = error.message;
      if (/calendar access|calendar scopes/i.test(message)) return message;
      return 'Hook up GoHighLevel in Profile first, then I can work with your contacts and calendar.';
    }
    if (error instanceof Error) return error.message;
    return 'Something went wrong while working with GoHighLevel.';
  }
}
