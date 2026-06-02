import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { CrmProvider } from '@prisma/client';

import { CRM_LABELS, crmLabel, crmLabelList } from '../common/crm-labels';
import type {
  GhlOpportunitySummary,
  GhlPipelineSummary,
} from '../integrations/ghl/ghl.service';
import { GhlService } from '../integrations/ghl/ghl.service';
import { PrismaService } from '../prisma/prisma.service';
import { HubspotCommandService } from './hubspot-command.service';
import {
  extractAppointmentCancelQuery,
  extractAppointmentDetails,
  extractAppointmentRange,
  extractCalendarCreateDetails,
  extractCalendarQuery,
  extractCalendarUpdateDetails,
  extractContactUpdateDetails,
  extractCreateDetails,
  extractFreeSlotsDetails,
  extractOpportunityCreateDetails,
  extractOpportunityListDetails,
  extractOpportunityQuery,
  extractOpportunityStatusDetails,
  extractOpportunityUpdateDetails,
  extractSearchQuery,
  mergeSessionIntoEntities,
  pendingIntentExpiry,
  shouldRunIntent,
} from './assistant-command.helpers';
import type {
  AssistantCommandResult,
  AssistantSessionContext,
  VoiceIntentPayload
} from './assistant.types';

@Injectable()
export class AssistantCommandService {
  private readonly logger = new Logger(AssistantCommandService.name);

  constructor(
    private readonly ghl: GhlService,
    private readonly hubspot: HubspotCommandService,
    private readonly prisma: PrismaService,
  ) {}

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

    // Decide whether this user is on GHL or HubSpot. Returns null when the
    // user has no integration and no plan provider yet — we surface a CRM-
    // agnostic "connect a CRM" message in that case so the copy never lies
    // about which CRM the user actually wanted.
    const provider = await this.loadProvider(userId);

    if (!provider) {
      return {
        response: `Connect ${crmLabelList()} in Settings first so I can work with your contacts and calendar.`,
        status: 'error',
        intent,
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
        const fromIntent =
          provider === CrmProvider.HUBSPOT
            ? await this.executeHubspotIntent(userId, resolved)
            : await this.executeFromIntent(userId, resolved);
        if (fromIntent) return fromIntent;
      }

      return provider === CrmProvider.HUBSPOT
        ? this.executeHubspotHeuristics(userId, normalized)
        : this.executeWithHeuristics(userId, normalized);
    } catch (error) {
      return {
        response:
          provider === CrmProvider.HUBSPOT
            ? this.hubspotErrorMessage(error)
            : this.ghlErrorMessage(error),
        status: 'error',
        intent,
      };
    }
  }

  /**
   * Look up which CRM provider this user is on. Source of truth is the
   * enabled IntegrationConnection row (set up by OAuth). Falls back to the
   * subscription plan provider. Returns null when neither exists so callers
   * can render a CRM-agnostic message instead of guessing GHL — picking the
   * wrong CRM here is what made the "Hook up GoHighLevel" prompt show for
   * users who actually wanted HubSpot.
   */
  private async loadProvider(userId: string): Promise<CrmProvider | null> {
    try {
      const enabled = await this.prisma.integrationConnection.findFirst({
        where: { userId, enabled: true },
        select: { provider: true },
      });
      if (enabled?.provider) return enabled.provider;

      const subscription = await this.prisma.subscription.findUnique({
        where: { userId },
        select: { plan: { select: { provider: true } } },
      });
      return subscription?.plan?.provider ?? null;
    } catch (err) {
      this.logger.warn(
        `loadProvider failed for user ${userId}: ${(err as Error).message}`,
      );
      return null;
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
      case 'update_contact':
        return this.updateContactFromDetails(
          userId,
          extractContactUpdateDetails(intent.entities),
        );
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
      case 'list_pipelines':
        return this.listPipelines(userId);
      case 'list_opportunities':
        return this.listOpportunitiesFromDetails(
          userId,
          extractOpportunityListDetails(intent.entities),
        );
      case 'find_opportunity':
        return this.findOpportunityByQuery(userId, extractOpportunityQuery(intent.entities));
      case 'create_opportunity':
        return this.createOpportunityFromDetails(
          userId,
          extractOpportunityCreateDetails(intent.entities),
        );
      case 'update_opportunity':
        return this.updateOpportunityFromDetails(
          userId,
          extractOpportunityUpdateDetails(intent.entities),
        );
      case 'update_opportunity_status':
        return this.updateOpportunityStatusFromDetails(
          userId,
          extractOpportunityStatusDetails(intent.entities),
        );
      case 'delete_opportunity':
        return this.deleteOpportunityByQuery(userId, extractOpportunityQuery(intent.entities));
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
    if (/\bpipelines?\b/.test(lower) && /\b(list|show|what|my|which|got)\b/.test(lower)) {
      return this.listPipelines(userId);
    }
    if (/\b(opportunit(y|ies)|deals?)\b/.test(lower) && /\b(list|show|what|my|recent|open|won|lost)\b/.test(lower)) {
      return this.listOpportunitiesFromDetails(
        userId,
        extractOpportunityListDetails({ limit: 10 }),
      );
    }
    return {
      response:
        'I can handle contacts, calendars, appointments, and opportunities in GoHighLevel. Try "pull up my contacts", "what\'s on my calendar", "book Sarah tomorrow at 2pm", "show my pipelines", or "create an opportunity Website Redesign for John Smith worth 2500 in Sales".',
      status: 'error',
    };
  }

  // ── HubSpot routing ─────────────────────────────────────────────────────────
  //
  // HubSpot now supports full contact CRUD (list, search, create, update,
  // delete). Deals and companies remain read-only — write surface and the
  // calendar / appointment paths still return a friendly "not wired yet"
  // message so the user knows the chat didn't silently swallow the request.

  private async executeHubspotIntent(
    userId: string,
    intent: VoiceIntentPayload,
  ): Promise<AssistantCommandResult | null> {
    switch (intent.intent) {
      case 'list_contacts':
        return this.hubspot.listLatestContacts(userId);
      case 'find_contact':
        return this.hubspot.findContact(userId, extractSearchQuery(intent.entities));
      case 'list_opportunities':
        // HubSpot's equivalent of opportunities is "deals".
        return this.hubspot.listRecentDeals(userId);
      case 'create_contact':
        return this.hubspot.createContact(userId, extractCreateDetails(intent.entities));
      case 'update_contact':
        return this.hubspot.updateContact(
          userId,
          extractContactUpdateDetails(intent.entities),
        );
      case 'delete_contact':
        return this.hubspot.deleteContact(userId, extractSearchQuery(intent.entities));
      case 'find_opportunity':
      case 'create_opportunity':
      case 'update_opportunity':
      case 'update_opportunity_status':
      case 'delete_opportunity':
        return {
          response:
            "I can list HubSpot deals. Searching or editing them through the assistant isn't wired up yet.",
          status: 'error',
        };
      case 'list_pipelines':
        return {
          response:
            "Pipelines aren't wired up for HubSpot yet — try \"show my deals\" instead.",
          status: 'error',
        };
      case 'list_calendars':
      case 'get_calendar':
      case 'create_calendar':
      case 'update_calendar':
      case 'delete_calendar':
      case 'get_free_slots':
      case 'list_appointments':
      case 'create_appointment':
      case 'cancel_appointment':
        return {
          response:
            "HubSpot doesn't expose calendars or appointments in this app yet.",
          status: 'error',
        };
      default:
        return null;
    }
  }

  private async executeHubspotHeuristics(
    userId: string,
    command: string,
  ): Promise<AssistantCommandResult> {
    const lower = command.toLowerCase();
    if (
      /\b(contacts?|people|leads|clients)\b/.test(lower) &&
      /\b(list|show|pull up|get|see|recent|latest|my|all|who)\b/.test(lower)
    ) {
      return this.hubspot.listLatestContacts(userId);
    }
    if (
      /\b(deals?|opportunit(y|ies))\b/.test(lower) &&
      /\b(list|show|what|my|recent|open|all)\b/.test(lower)
    ) {
      return this.hubspot.listRecentDeals(userId);
    }
    if (
      /\b(compan(y|ies)|accounts?|organi[sz]ations?)\b/.test(lower) &&
      /\b(list|show|what|my|recent|all)\b/.test(lower)
    ) {
      return this.hubspot.listRecentCompanies(userId);
    }
    return {
      response:
        'I can show your HubSpot contacts, deals, or companies. Try "pull up my contacts", "list my deals", or "what companies do I have".',
      status: 'error',
    };
  }

  private hubspotErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      // HubspotApiClient already throws Nest exceptions with friendly copy
      // (reconnect / scope / rate-limit messages). Surface them verbatim.
      return error.message;
    }
    return `Something went wrong talking to ${CRM_LABELS[CrmProvider.HUBSPOT]}.`;
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

  private async updateContactFromDetails(
    userId: string,
    details: ReturnType<typeof extractContactUpdateDetails>,
  ): Promise<AssistantCommandResult> {
    // Resolve which contact to update.
    //
    // IMPORTANT: an explicit name in the user's message ALWAYS wins over a
    // contactId carried over from session context (the previous turn's
    // `lastContactId`). Otherwise saying "update Jordan Smith" right after
    // looking at "Random Contact" would update Random Contact.
    //
    // Only fall back to the session contactId when the user gave no name at
    // all (e.g. follow-up like "update their phone to ...").
    const query = details.query?.trim();
    let contactId: string | undefined;
    let resolvedName: string | undefined;

    if (query) {
      const matches = await this.findMatchingContacts(userId, query);
      if (matches.length === 0) {
        return { response: `No contact matches "${query}".`, status: 'error' };
      }
      if (matches.length > 1) {
        return {
          response: `Which one should I update?\n${matches.slice(0, 5).map((c) => this.formatContact(c)).join('\n')}`,
          status: 'error',
        };
      }
      contactId = matches[0].id;
      resolvedName = matches[0].name;
    } else if (details.contactId) {
      contactId = details.contactId;
    } else {
      return {
        response: 'Who should I update? Give me a name, phone, or email.',
        status: 'error',
      };
    }

    // Build the patch from the "new*" fields the LLM extracted.
    const patch: {
      firstName?: string;
      lastName?: string;
      name?: string;
      phone?: string;
      email?: string;
    } = {};
    if (details.newFirstName) patch.firstName = details.newFirstName;
    if (details.newLastName) patch.lastName = details.newLastName;
    if (details.newName) patch.name = details.newName;
    if (details.newPhone) patch.phone = details.newPhone;
    if (details.newEmail) patch.email = details.newEmail;

    if (Object.keys(patch).length === 0) {
      return {
        response: `What should I update on ${resolvedName ?? 'this contact'}? (phone, email, or name)`,
        status: 'error',
      };
    }

    const updated = await this.ghl.updateContact(userId, contactId, patch);
    const changed = Object.entries(patch)
      .map(([k, v]) => `${k} → ${v}`)
      .join(', ');
    return {
      response: `Updated ${updated.name} (${changed}).`,
      status: 'success',
      contextPatch: { lastContactId: updated.id, lastContactName: updated.name },
      clearPendingIntent: true,
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

  // ── Opportunities & pipelines ──────────────────────────────────────────────

  private async listPipelines(userId: string): Promise<AssistantCommandResult> {
    const { pipelines } = await this.ghl.listPipelines(userId);
    if (pipelines.length === 0) {
      return {
        response: "You don't have any pipelines set up in GoHighLevel yet.",
        status: 'success',
        clearPendingIntent: true,
      };
    }
    return {
      response: `Your pipelines:\n${pipelines.map((p) => this.formatPipeline(p)).join('\n')}`,
      status: 'success',
      contextPatch: { lastPipelineId: pipelines[0].id, lastPipelineName: pipelines[0].name },
      clearPendingIntent: true,
    };
  }

  private async listOpportunitiesFromDetails(
    userId: string,
    details: ReturnType<typeof extractOpportunityListDetails>,
  ): Promise<AssistantCommandResult> {
    const { pipelineId, pipelineName } = await this.resolvePipelineRef(
      userId,
      details.pipelineId,
      details.pipelineName,
    );
    const pipelineStageId = await this.resolvePipelineStageId(
      userId,
      pipelineId,
      details.pipelineStageId,
      details.pipelineStageName,
    );

    const contactId =
      details.contactId ||
      (details.contactName ? await this.tryResolveContactId(userId, details.contactName) : undefined);

    const result = await this.ghl.listOpportunities(userId, {
      pipelineId,
      pipelineStageId,
      contactId,
      status: details.status,
      query: details.query,
      limit: details.limit ?? 10,
    });

    if (result.opportunities.length === 0) {
      return {
        response: pipelineName
          ? `No opportunities in "${pipelineName}".`
          : 'No opportunities matched.',
        status: 'success',
        clearPendingIntent: true,
      };
    }
    const top = result.opportunities[0];
    return {
      response: `Opportunities:\n${result.opportunities
        .slice(0, 10)
        .map((o) => this.formatOpportunity(o))
        .join('\n')}`,
      status: 'success',
      contextPatch: this.opportunityContextPatch(top, pipelineName),
      clearPendingIntent: true,
    };
  }

  private async findOpportunityByQuery(
    userId: string,
    query: string,
  ): Promise<AssistantCommandResult> {
    if (!query.trim()) {
      return {
        response: 'Which opportunity? Give me a name or part of it.',
        status: 'error',
      };
    }
    const matches = await this.findMatchingOpportunities(userId, query);
    if (matches.length === 0) {
      return { response: `No opportunity matches "${query}".`, status: 'error' };
    }
    const top = matches[0];
    return {
      response:
        matches.length === 1
          ? `Found it:\n${this.formatOpportunity(top)}`
          : `Found ${matches.length} matches:\n${matches.slice(0, 5).map((o) => this.formatOpportunity(o)).join('\n')}`,
      status: 'success',
      contextPatch: this.opportunityContextPatch(top),
      clearPendingIntent: true,
    };
  }

  /**
   * Multi-turn create flow.
   * Required, asked in order: name → monetaryValue → pipelineName.
   * When a field is missing, returns a pendingIntent so the next user message
   * is interpreted as the answer to that specific question — without losing
   * the entities we already have.
   */
  private async createOpportunityFromDetails(
    userId: string,
    details: ReturnType<typeof extractOpportunityCreateDetails>,
  ): Promise<AssistantCommandResult> {
    const knownEntities: Record<string, string | number | boolean | null> = {};
    if (details.name?.trim()) knownEntities.name = details.name.trim();
    if (details.pipelineId?.trim()) knownEntities.pipelineId = details.pipelineId.trim();
    if (details.pipelineName?.trim()) knownEntities.pipelineName = details.pipelineName.trim();
    if (details.pipelineStageId?.trim())
      knownEntities.pipelineStageId = details.pipelineStageId.trim();
    if (details.pipelineStageName?.trim())
      knownEntities.pipelineStageName = details.pipelineStageName.trim();
    if (details.contactId?.trim()) knownEntities.contactId = details.contactId.trim();
    if (details.contactName?.trim()) knownEntities.contactName = details.contactName.trim();
    if (typeof details.monetaryValue === 'number') knownEntities.monetaryValue = details.monetaryValue;
    if (details.monetaryValueSkipped) knownEntities.monetaryValueSkipped = true;
    if (details.status) knownEntities.status = details.status;
    if (details.assignedTo?.trim()) knownEntities.assignedTo = details.assignedTo.trim();
    if (details.source?.trim()) knownEntities.source = details.source.trim();

    // Field gather order — change here to reorder the conversational flow.
    // contactName comes first because GHL requires a contactId on opportunity
    // create and we resolve contactId from the name.
    const requiredOrder: Array<'contact' | 'name' | 'monetaryValue' | 'pipeline'> = [
      'contact',
      'name',
      'monetaryValue',
      'pipeline',
    ];
    const missing: string[] = [];
    for (const field of requiredOrder) {
      if (field === 'contact' && !knownEntities.contactId && !knownEntities.contactName) {
        missing.push('contactName');
      }
      if (field === 'name' && !knownEntities.name) missing.push('name');
      if (
        field === 'monetaryValue' &&
        typeof knownEntities.monetaryValue !== 'number' &&
        !knownEntities.monetaryValueSkipped
      ) {
        missing.push('monetaryValue');
      }
      if (field === 'pipeline' && !knownEntities.pipelineId && !knownEntities.pipelineName) {
        missing.push('pipelineName');
      }
    }

    if (missing.length > 0) {
      const next = missing[0];
      const question = this.questionForField(next, knownEntities);
      return {
        response: question,
        status: 'error',
        pendingIntent: {
          intent: 'create_opportunity',
          entities: knownEntities,
          missing,
          question,
          expiresAt: pendingIntentExpiry(),
        },
      };
    }

    // All required info collected — resolve and create.
    const resolvedPipeline = await this.resolvePipelineRef(
      userId,
      typeof knownEntities.pipelineId === 'string' ? knownEntities.pipelineId : undefined,
      typeof knownEntities.pipelineName === 'string' ? knownEntities.pipelineName : undefined,
    );
    if (!resolvedPipeline.pipelineId) {
      // Pipeline name didn't match anything — list options and re-ask.
      const { pipelines } = await this.ghl.listPipelines(userId);
      if (pipelines.length === 0) {
        return {
          response:
            'No pipelines in GoHighLevel yet — create one in the GHL dashboard before adding opportunities.',
          status: 'error',
          clearPendingIntent: true,
        };
      }
      const names = pipelines.map((p) => `· ${p.name}`).join('\n');
      const stillKnown = { ...knownEntities };
      delete stillKnown.pipelineId;
      delete stillKnown.pipelineName;
      const question = `I couldn't find a pipeline matching "${knownEntities.pipelineName ?? ''}". Which one should I use?\n${names}`;
      return {
        response: question,
        status: 'error',
        pendingIntent: {
          intent: 'create_opportunity',
          entities: stillKnown,
          missing: ['pipelineName'],
          question,
          expiresAt: pendingIntentExpiry(),
        },
      };
    }

    const pipelineStageId = await this.resolvePipelineStageId(
      userId,
      resolvedPipeline.pipelineId,
      typeof knownEntities.pipelineStageId === 'string' ? knownEntities.pipelineStageId : undefined,
      typeof knownEntities.pipelineStageName === 'string'
        ? knownEntities.pipelineStageName
        : undefined,
    );

    let contactId =
      typeof knownEntities.contactId === 'string' ? knownEntities.contactId : undefined;
    if (!contactId && typeof knownEntities.contactName === 'string') {
      contactId = await this.tryResolveContactId(userId, knownEntities.contactName);
    }
    if (!contactId) {
      // GHL requires a contactId — re-ask with a clearer prompt rather than
      // letting GHL reject the request with its 422.
      const stillKnown = { ...knownEntities };
      delete stillKnown.contactId;
      const givenName =
        typeof knownEntities.contactName === 'string' ? knownEntities.contactName : '';
      const question = givenName
        ? `I couldn't find a contact matching "${givenName}". Give me a full name, phone, or email — or say "create new contact ${givenName}" first.`
        : 'Who is the opportunity for? Give me a contact name, phone, or email.';
      // Drop the unmatched contactName so the next reply replaces it.
      delete stillKnown.contactName;
      return {
        response: question,
        status: 'error',
        pendingIntent: {
          intent: 'create_opportunity',
          entities: stillKnown,
          missing: ['contactName'],
          question,
          expiresAt: pendingIntentExpiry(),
        },
      };
    }

    const created = await this.ghl.createOpportunity(userId, {
      pipelineId: resolvedPipeline.pipelineId,
      pipelineStageId,
      name: String(knownEntities.name),
      status:
        typeof knownEntities.status === 'string'
          ? (knownEntities.status as 'open' | 'won' | 'lost' | 'abandoned')
          : undefined,
      monetaryValue:
        typeof knownEntities.monetaryValue === 'number' ? knownEntities.monetaryValue : undefined,
      contactId,
      assignedTo: typeof knownEntities.assignedTo === 'string' ? knownEntities.assignedTo : undefined,
      source: typeof knownEntities.source === 'string' ? knownEntities.source : undefined,
    });
    // Preserve the resolved contactId on the summary so the success message
    // can reference the contact even if GHL doesn't echo the name back.
    if (!created.contactId) created.contactId = contactId;

    const bits = [
      created.contactName ? `for ${created.contactName}` : null,
      typeof created.monetaryValue === 'number'
        ? `worth ${this.formatMoney(created.monetaryValue)}`
        : null,
      resolvedPipeline.pipelineName ? `in ${resolvedPipeline.pipelineName}` : null,
    ]
      .filter(Boolean)
      .join(' ');

    return {
      response: `Created opportunity "${created.name}"${bits ? ` ${bits}` : ''}.`,
      status: 'success',
      contextPatch: this.opportunityContextPatch(created, resolvedPipeline.pipelineName),
      clearPendingIntent: true,
    };
  }

  private async updateOpportunityFromDetails(
    userId: string,
    details: ReturnType<typeof extractOpportunityUpdateDetails>,
  ): Promise<AssistantCommandResult> {
    const target = await this.resolveOpportunityTarget(userId, {
      opportunityId: details.opportunityId,
      opportunityName: details.opportunityName,
      query: details.query,
    });
    if (target.kind === 'missing') return target.result;

    const pipelineResolved = await this.resolvePipelineRef(
      userId,
      details.pipelineId,
      details.pipelineName,
    );
    const pipelineStageId = await this.resolvePipelineStageId(
      userId,
      pipelineResolved.pipelineId ?? target.opportunity.pipelineId,
      details.pipelineStageId,
      details.pipelineStageName,
    );

    const updated = await this.ghl.updateOpportunity(userId, target.opportunity.id, {
      name: details.name,
      pipelineId: pipelineResolved.pipelineId,
      pipelineStageId,
      status: details.status,
      monetaryValue: details.monetaryValue,
      assignedTo: details.assignedTo,
      source: details.source,
    });

    return {
      response: `Updated "${updated.name}".`,
      status: 'success',
      contextPatch: this.opportunityContextPatch(updated, pipelineResolved.pipelineName),
      clearPendingIntent: true,
    };
  }

  private async updateOpportunityStatusFromDetails(
    userId: string,
    details: ReturnType<typeof extractOpportunityStatusDetails>,
  ): Promise<AssistantCommandResult> {
    if (!details.status) {
      return {
        response: 'What status? Use open, won, lost, or abandoned.',
        status: 'error',
      };
    }
    const target = await this.resolveOpportunityTarget(userId, {
      opportunityId: details.opportunityId,
      opportunityName: details.opportunityName,
      query: details.query,
    });
    if (target.kind === 'missing') return target.result;

    const updated = await this.ghl.updateOpportunityStatus(
      userId,
      target.opportunity.id,
      details.status,
      details.lostReasonId,
    );

    return {
      response: `Marked "${updated.name}" as ${updated.status}.`,
      status: 'success',
      contextPatch: this.opportunityContextPatch(updated),
      clearPendingIntent: true,
    };
  }

  private async deleteOpportunityByQuery(
    userId: string,
    query: string,
  ): Promise<AssistantCommandResult> {
    if (!query.trim()) {
      return {
        response: 'Which opportunity should I remove? Give me a name.',
        status: 'error',
      };
    }
    const target = await this.resolveOpportunityTarget(userId, { query });
    if (target.kind === 'missing') return target.result;

    await this.ghl.deleteOpportunity(userId, target.opportunity.id);
    return {
      response: `Removed opportunity "${target.opportunity.name}".`,
      status: 'success',
      clearPendingIntent: true,
    };
  }

  private questionForField(
    field: string,
    known: Record<string, string | number | boolean | null>,
  ): string {
    switch (field) {
      case 'contactName':
        return known.name
          ? `Who is the opportunity "${known.name}" for? Give me a contact name, phone, or email.`
          : 'Who is the opportunity for? Give me a contact name, phone, or email.';
      case 'name':
        return known.contactName
          ? `What would you like to name the opportunity for ${known.contactName}?`
          : 'What would you like to name the opportunity?';
      case 'monetaryValue':
        return known.name
          ? `What's the value of "${known.name}"? (You can say a number, "$2500", "2.5k", or "skip".)`
          : "What's the opportunity value? (You can say a number, \"$2500\", \"2.5k\", or \"skip\".)";
      case 'pipelineName':
      case 'pipelineId':
        return known.name
          ? `Which pipeline should I place "${known.name}" in?`
          : 'Which pipeline should I place it in?';
      default:
        return `I still need: ${field}.`;
    }
  }

  private async resolvePipelineRef(
    userId: string,
    pipelineId: string | undefined,
    pipelineName: string | undefined,
  ): Promise<{ pipelineId?: string; pipelineName?: string; pipeline?: GhlPipelineSummary }> {
    if (pipelineId?.trim()) {
      const { pipelines } = await this.ghl.listPipelines(userId);
      const match = pipelines.find((p) => p.id === pipelineId.trim());
      return {
        pipelineId: pipelineId.trim(),
        pipelineName: match?.name ?? pipelineName,
        pipeline: match,
      };
    }
    if (!pipelineName?.trim()) {
      return {};
    }
    const { pipelines } = await this.ghl.listPipelines(userId);
    if (pipelines.length === 0) {
      return {};
    }
    const target = pipelineName.trim().toLowerCase();
    const match =
      pipelines.find((p) => p.name.toLowerCase() === target) ??
      pipelines.find((p) => p.name.toLowerCase().includes(target));
    return match
      ? { pipelineId: match.id, pipelineName: match.name, pipeline: match }
      : {};
  }

  private async resolvePipelineStageId(
    userId: string,
    pipelineId: string | undefined,
    stageId: string | undefined,
    stageName: string | undefined,
  ): Promise<string | undefined> {
    if (stageId?.trim()) return stageId.trim();
    if (!stageName?.trim() || !pipelineId) return undefined;
    const { pipelines } = await this.ghl.listPipelines(userId);
    const pipeline = pipelines.find((p) => p.id === pipelineId);
    if (!pipeline) return undefined;
    const target = stageName.trim().toLowerCase();
    const match =
      pipeline.stages.find((s) => s.name.toLowerCase() === target) ??
      pipeline.stages.find((s) => s.name.toLowerCase().includes(target));
    return match?.id;
  }

  private async resolveOpportunityTarget(
    userId: string,
    input: { opportunityId?: string; opportunityName?: string; query?: string },
  ): Promise<
    | { kind: 'ok'; opportunity: GhlOpportunitySummary }
    | { kind: 'missing'; result: AssistantCommandResult }
  > {
    if (input.opportunityId?.trim()) {
      const opportunity = await this.ghl.getOpportunity(userId, input.opportunityId.trim());
      return { kind: 'ok', opportunity };
    }
    const query = input.opportunityName?.trim() || input.query?.trim() || '';
    if (!query) {
      return {
        kind: 'missing',
        result: { response: 'Which opportunity? Give me a name.', status: 'error' },
      };
    }
    const matches = await this.findMatchingOpportunities(userId, query);
    if (matches.length === 0) {
      return {
        kind: 'missing',
        result: { response: `No opportunity matches "${query}".`, status: 'error' },
      };
    }
    if (matches.length > 1) {
      return {
        kind: 'missing',
        result: {
          response: `Which one?\n${matches.slice(0, 5).map((o) => this.formatOpportunity(o)).join('\n')}`,
          status: 'error',
        },
      };
    }
    return { kind: 'ok', opportunity: matches[0] };
  }

  private async findMatchingOpportunities(
    userId: string,
    query: string,
  ): Promise<GhlOpportunitySummary[]> {
    const trimmed = query.trim();
    const result = await this.ghl.listOpportunities(userId, {
      query: trimmed,
      limit: 20,
    });
    const normalized = this.normalizeSearch(trimmed);
    const filtered = result.opportunities.filter((opp) => {
      const haystack = this.normalizeSearch(
        [opp.name, opp.contactName].filter(Boolean).join(' '),
      );
      return haystack.includes(normalized);
    });
    return filtered.length > 0 ? filtered : result.opportunities;
  }

  private async tryResolveContactId(
    userId: string,
    contactName: string,
  ): Promise<string | undefined> {
    const matches = await this.findMatchingContacts(userId, contactName);
    return matches[0]?.id;
  }

  private opportunityContextPatch(
    opportunity: GhlOpportunitySummary,
    pipelineName?: string,
  ): AssistantSessionContext {
    return {
      lastOpportunityId: opportunity.id,
      lastOpportunityName: opportunity.name,
      lastPipelineId: opportunity.pipelineId,
      lastPipelineName: pipelineName ?? undefined,
      lastPipelineStageId: opportunity.pipelineStageId,
      lastContactId: opportunity.contactId,
      lastContactName: opportunity.contactName,
    };
  }

  private formatPipeline(pipeline: GhlPipelineSummary): string {
    const stageNames = pipeline.stages.map((s) => s.name).slice(0, 4).join(', ');
    return stageNames
      ? `· ${pipeline.name} — stages: ${stageNames}${pipeline.stages.length > 4 ? ', …' : ''}`
      : `· ${pipeline.name}`;
  }

  private formatOpportunity(opportunity: GhlOpportunitySummary): string {
    const bits: string[] = [];
    if (opportunity.contactName) bits.push(opportunity.contactName);
    if (typeof opportunity.monetaryValue === 'number') {
      bits.push(this.formatMoney(opportunity.monetaryValue));
    }
    if (opportunity.status) bits.push(opportunity.status);
    if (opportunity.pipelineStageName) bits.push(opportunity.pipelineStageName);
    const detail = bits.filter(Boolean).join(' · ');
    return detail ? `· ${opportunity.name} — ${detail}` : `· ${opportunity.name}`;
  }

  private formatMoney(value: number): string {
    if (!Number.isFinite(value)) return String(value);
    return `$${value.toLocaleString('en-US')}`;
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
      // Anything that already looks like a friendly "reconnect with X scope"
      // message should pass straight through — the service builds those per
      // API surface (calendar / opportunities / contacts / generic scope).
      if (
        /calendar access|calendar scopes|opportunities access|opportunity scopes|contact access|contact scopes|missing a scope/i.test(
          message,
        )
      ) {
        return message;
      }
      return `Hook up ${CRM_LABELS[CrmProvider.GHL]} in Profile first, then I can work with your contacts, calendar, and opportunities.`;
    }
    if (error instanceof Error) return error.message;
    return `Something went wrong while working with ${CRM_LABELS[CrmProvider.GHL]}.`;
  }
}
