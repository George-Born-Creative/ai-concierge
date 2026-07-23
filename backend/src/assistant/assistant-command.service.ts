import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { CrmProvider } from '@prisma/client';

import { CRM_LABELS, crmLabel, crmLabelList } from '../common/crm-labels';
import type {
  GhlAppointmentSummary,
  GhlOpportunitySummary,
  GhlPipelineSummary,
} from '../integrations/ghl/ghl.service';
import { GhlService } from '../integrations/ghl/ghl.service';
import { GhlConversationsService } from '../integrations/ghl/conversations/ghl-conversations.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { HubspotCommandService } from './hubspot-command.service';
import {
  extractAppointmentCancelQuery,
  extractAppointmentDetails,
  extractAppointmentRange,
  extractCalendarCreateDetails,
  extractCalendarQuery,
  extractCalendarUpdateDetails,
  extractCompanyContactAssociation,
  extractCompanyCreateDetails,
  extractCompanyDealAssociation,
  extractCompanyQuery,
  extractCompanyUpdateDetails,
  extractContactUpdateDetails,
  extractConversationQuery,
  extractConversationRead,
  extractCreateDetails,
  extractFreeSlotsDetails,
  extractOpportunityCreateDetails,
  extractOpportunityListDetails,
  extractOpportunityQuery,
  extractOpportunityStatusDetails,
  extractOpportunityUpdateDetails,
  extractOrderCompanyAssociation,
  extractOrderContactAssociation,
  extractOrderCreateDetails,
  extractOrderDealAssociation,
  extractOrderUpdateDetails,
  extractProductCreateDetails,
  extractProductUpdateDetails,
  extractSearchQuery,
  extractTicketCompanyAssociation,
  extractTicketContactAssociation,
  extractTicketCreateDetails,
  extractTicketDealAssociation,
  extractTicketUpdateDetails,
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

  // Maps a mutating intent to the browse-list object key the frontend uses
  // (see components/ghl|hubspot/*-data-screen-content.tsx). Read intents
  // (list_/find_/get_) are intentionally absent so they never trigger an
  // invalidation. Appointments have no browse list here, so they're omitted.
  private static readonly MUTATION_OBJECTS: Record<string, string> = {
    create_contact: 'contacts',
    update_contact: 'contacts',
    delete_contact: 'contacts',
    create_calendar: 'calendar',
    update_calendar: 'calendar',
    delete_calendar: 'calendar',
    create_opportunity: 'opportunities',
    update_opportunity: 'opportunities',
    update_opportunity_status: 'opportunities',
    delete_opportunity: 'opportunities',
    create_company: 'companies',
    update_company: 'companies',
    delete_company: 'companies',
    attach_contact_to_company: 'companies',
    detach_contact_from_company: 'companies',
    attach_deal_to_company: 'companies',
    detach_deal_from_company: 'companies',
    create_ticket: 'tickets',
    update_ticket: 'tickets',
    delete_ticket: 'tickets',
    attach_ticket_to_contact: 'tickets',
    detach_ticket_from_contact: 'tickets',
    attach_ticket_to_company: 'tickets',
    detach_ticket_from_company: 'tickets',
    attach_ticket_to_deal: 'tickets',
    detach_ticket_from_deal: 'tickets',
    create_product: 'products',
    update_product: 'products',
    delete_product: 'products',
    create_order: 'orders',
    update_order: 'orders',
    delete_order: 'orders',
    attach_order_to_contact: 'orders',
    detach_order_from_contact: 'orders',
    attach_order_to_company: 'orders',
    detach_order_from_company: 'orders',
    attach_order_to_deal: 'orders',
    detach_order_from_deal: 'orders',
  };

  constructor(
    private readonly ghl: GhlService,
    private readonly ghlConversations: GhlConversationsService,
    private readonly hubspot: HubspotCommandService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
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

      let result: AssistantCommandResult | null = null;
      if (resolved && shouldRunIntent(resolved)) {
        result =
          provider === CrmProvider.HUBSPOT
            ? await this.executeHubspotIntent(userId, resolved)
            : await this.executeFromIntent(userId, resolved);
      }
      if (!result) {
        result =
          provider === CrmProvider.HUBSPOT
            ? await this.executeHubspotHeuristics(userId, normalized)
            : await this.executeWithHeuristics(userId, normalized);
      }

      // Sprint 2: after a successful CRM mutation, tell the user's open browse
      // screens to refetch the affected object (self-mutation invalidation).
      // Reads map to no object, so this is a no-op for them.
      this.emitCrmInvalidate(userId, provider, resolved?.intent, result);
      return result;
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

  /**
   * Emit `crm.invalidate` to the user's connected devices when a command
   * successfully mutated CRM data, so any open browse list refetches just the
   * affected object. No-op for reads (which don't map to a mutation object)
   * and for failed commands.
   */
  private emitCrmInvalidate(
    userId: string,
    provider: CrmProvider,
    intent: string | undefined,
    result: AssistantCommandResult,
  ): void {
    if (result.status !== 'success' || !intent) return;
    const object = AssistantCommandService.MUTATION_OBJECTS[intent];
    if (!object) return;
    this.realtime.emitToUser(userId, 'crm.invalidate', {
      provider: provider === CrmProvider.HUBSPOT ? 'hubspot' : 'ghl',
      object,
    });
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
      case 'list_tickets':
      case 'find_ticket':
      case 'create_ticket':
      case 'update_ticket':
      case 'delete_ticket':
      case 'attach_ticket_to_contact':
      case 'detach_ticket_from_contact':
      case 'attach_ticket_to_company':
      case 'detach_ticket_from_company':
      case 'attach_ticket_to_deal':
      case 'detach_ticket_from_deal':
        return {
          response:
            'Tickets are a HubSpot feature — your account is on GoHighLevel, which uses opportunities instead. Try "show my opportunities".',
          status: 'error',
        };
      case 'list_products':
      case 'find_product':
      case 'create_product':
      case 'update_product':
      case 'delete_product':
        return {
          response:
            'Products are a HubSpot feature — your account is on GoHighLevel, which doesn\'t have a product catalog. Try "show my opportunities" instead.',
          status: 'error',
        };
      case 'list_orders':
      case 'find_order':
      case 'create_order':
      case 'update_order':
      case 'delete_order':
      case 'attach_order_to_contact':
      case 'detach_order_from_contact':
      case 'attach_order_to_company':
      case 'detach_order_from_company':
      case 'attach_order_to_deal':
      case 'detach_order_from_deal':
        return {
          response:
            'Orders are a HubSpot feature — your account is on GoHighLevel, which uses opportunities instead. Try "show my opportunities".',
          status: 'error',
        };
      case 'list_conversations':
        return this.listConversations(userId, extractConversationQuery(intent.entities));
      case 'find_conversation':
        return this.findConversation(userId, extractConversationQuery(intent.entities));
      case 'read_conversation':
        return this.readConversation(userId, extractConversationRead(intent.entities));
      default:
        return null;
    }
  }

  private async listConversations(
    userId: string,
    details: { limit: number; unreadOnly: boolean },
  ): Promise<AssistantCommandResult> {
    try {
      const result = await this.ghlConversations.searchConversations(userId, details);
      if (!result.conversations || result.conversations.length === 0) {
        return { response: 'You have no recent conversations.', status: 'success' };
      }
      const chatNames = result.conversations.map((c) => c.contactName).filter(Boolean);
      return {
        response: `I found ${result.conversations.length} conversation(s). The most recent are with ${chatNames.slice(0, 3).join(', ')}.`,
        status: 'success',
      };
    } catch (error) {
      return { response: 'Failed to list your conversations.', status: 'error' };
    }
  }

  private async findConversation(
    userId: string,
    details: { query?: string; unreadOnly: boolean },
  ): Promise<AssistantCommandResult> {
    if (!details.query) {
      return { response: 'Who are you looking for?', status: 'error' };
    }
    try {
      const result = await this.ghlConversations.searchConversations(userId, details);
      if (!result.conversations || result.conversations.length === 0) {
        return { response: `I couldn't find any conversations for "${details.query}".`, status: 'success' };
      }
      const match = result.conversations[0];
      return {
        response: `Found a conversation with ${match.contactName}. The last message was sent ${new Date(match.lastMessageAt || '').toLocaleDateString()}.`,
        status: 'success',
      };
    } catch (error) {
      return { response: `Failed to search for ${details.query}.`, status: 'error' };
    }
  }

  private async readConversation(
    userId: string,
    details: { id?: string; contactName?: string },
  ): Promise<AssistantCommandResult> {
    try {
      let conversationId = details.id;
      if (!conversationId && details.contactName) {
         const search = await this.ghlConversations.searchConversations(userId, { query: details.contactName, unreadOnly: false });
         if (search.conversations && search.conversations.length > 0) {
           conversationId = search.conversations[0].id;
         }
      }
      if (!conversationId) {
         return { response: 'I could not figure out which conversation you want to read.', status: 'error' };
      }

      const result = await this.ghlConversations.getMessages(userId, conversationId, { limit: 5 });
      if (!result.messages || result.messages.length === 0) {
        return { response: 'That conversation has no messages.', status: 'success' };
      }
      const lastMsg = result.messages[0];
      return {
        response: `The last message says: "${lastMsg.body}"`,
        status: 'success',
      };
    } catch (error) {
      return { response: 'Failed to read the conversation.', status: 'error' };
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
  // HubSpot now supports full contact CRUD plus full company CRUD and
  // contact/deal associations on companies. Deal read works (list); deal
  // search/edit + calendars/appointments still return a friendly "not wired
  // yet" message so the user knows the chat didn't silently swallow the
  // request.

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
      case 'list_companies':
        return this.hubspot.listLatestCompanies(userId);
      case 'find_company':
        return this.hubspot.findCompany(userId, extractCompanyQuery(intent.entities));
      case 'create_company':
        return this.hubspot.createCompany(
          userId,
          extractCompanyCreateDetails(intent.entities),
        );
      case 'update_company':
        return this.hubspot.updateCompany(
          userId,
          extractCompanyUpdateDetails(intent.entities),
        );
      case 'delete_company':
        return this.hubspot.deleteCompany(userId, extractCompanyQuery(intent.entities));
      case 'attach_contact_to_company':
        return this.hubspot.attachContactToCompany(
          userId,
          extractCompanyContactAssociation(intent.entities),
        );
      case 'detach_contact_from_company':
        return this.hubspot.detachContactFromCompany(
          userId,
          extractCompanyContactAssociation(intent.entities),
        );
      case 'attach_deal_to_company':
        return this.hubspot.attachDealToCompany(
          userId,
          extractCompanyDealAssociation(intent.entities),
        );
      case 'detach_deal_from_company':
        return this.hubspot.detachDealFromCompany(
          userId,
          extractCompanyDealAssociation(intent.entities),
        );
      case 'list_tickets':
        return this.hubspot.listRecentTickets(userId);
      case 'find_ticket':
        return this.hubspot.findTicket(userId, extractSearchQuery(intent.entities));
      case 'create_ticket':
        return this.hubspot.createTicket(
          userId,
          extractTicketCreateDetails(intent.entities),
        );
      case 'update_ticket':
        return this.hubspot.updateTicket(
          userId,
          extractTicketUpdateDetails(intent.entities),
        );
      case 'delete_ticket':
        return this.hubspot.deleteTicket(userId, extractSearchQuery(intent.entities));
      case 'attach_ticket_to_contact':
        return this.hubspot.attachTicketToContact(
          userId,
          extractTicketContactAssociation(intent.entities),
        );
      case 'detach_ticket_from_contact':
        return this.hubspot.detachTicketFromContact(
          userId,
          extractTicketContactAssociation(intent.entities),
        );
      case 'attach_ticket_to_company':
        return this.hubspot.attachTicketToCompany(
          userId,
          extractTicketCompanyAssociation(intent.entities),
        );
      case 'detach_ticket_from_company':
        return this.hubspot.detachTicketFromCompany(
          userId,
          extractTicketCompanyAssociation(intent.entities),
        );
      case 'attach_ticket_to_deal':
        return this.hubspot.attachTicketToDeal(
          userId,
          extractTicketDealAssociation(intent.entities),
        );
      case 'detach_ticket_from_deal':
        return this.hubspot.detachTicketFromDeal(
          userId,
          extractTicketDealAssociation(intent.entities),
        );
      case 'list_products':
        return this.hubspot.listRecentProducts(userId);
      case 'find_product':
        return this.hubspot.findProduct(userId, extractSearchQuery(intent.entities));
      case 'create_product':
        return this.hubspot.createProduct(
          userId,
          extractProductCreateDetails(intent.entities),
        );
      case 'update_product':
        return this.hubspot.updateProduct(
          userId,
          extractProductUpdateDetails(intent.entities),
        );
      case 'delete_product':
        return this.hubspot.deleteProduct(userId, extractSearchQuery(intent.entities));
      case 'list_orders':
        return this.hubspot.listRecentOrders(userId);
      case 'find_order':
        return this.hubspot.findOrder(userId, extractSearchQuery(intent.entities));
      case 'create_order':
        return this.hubspot.createOrder(
          userId,
          extractOrderCreateDetails(intent.entities),
        );
      case 'update_order':
        return this.hubspot.updateOrder(
          userId,
          extractOrderUpdateDetails(intent.entities),
        );
      case 'delete_order':
        return this.hubspot.deleteOrder(userId, extractSearchQuery(intent.entities));
      case 'attach_order_to_contact':
        return this.hubspot.attachOrderToContact(
          userId,
          extractOrderContactAssociation(intent.entities),
        );
      case 'detach_order_from_contact':
        return this.hubspot.detachOrderFromContact(
          userId,
          extractOrderContactAssociation(intent.entities),
        );
      case 'attach_order_to_company':
        return this.hubspot.attachOrderToCompany(
          userId,
          extractOrderCompanyAssociation(intent.entities),
        );
      case 'detach_order_from_company':
        return this.hubspot.detachOrderFromCompany(
          userId,
          extractOrderCompanyAssociation(intent.entities),
        );
      case 'attach_order_to_deal':
        return this.hubspot.attachOrderToDeal(
          userId,
          extractOrderDealAssociation(intent.entities),
        );
      case 'detach_order_from_deal':
        return this.hubspot.detachOrderFromDeal(
          userId,
          extractOrderDealAssociation(intent.entities),
        );
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
      return this.hubspot.listLatestCompanies(userId);
    }
    if (
      /\btickets?\b/.test(lower) &&
      /\b(list|show|what|my|recent|open|all)\b/.test(lower)
    ) {
      return this.hubspot.listRecentTickets(userId);
    }
    if (
      /\b(products?|catalog|catalogue|sku)\b/.test(lower) &&
      /\b(list|show|what|my|recent|all|sell)\b/.test(lower)
    ) {
      return this.hubspot.listRecentProducts(userId);
    }
    if (
      /\borders?\b/.test(lower) &&
      /\b(list|show|what|my|recent|all|history)\b/.test(lower)
    ) {
      return this.hubspot.listRecentOrders(userId);
    }

    // Last-line-of-defense fallbacks for company writes when the LLM
    // mislabels the intent (e.g. emits "unknown" or routes to "create_deal"
    // for a company create). Capture the most common phrasing patterns and
    // re-route through the proper command method.
    const createCompanyMatch = command.match(
      /\b(?:create|add|save|make)\s+(?:a|an|the|new)?\s*(?:compan(?:y|ies)|account|organi[sz]ation)\s+(?:called|named)?\s*"?([^",]+?)"?(?:\s+(?:with|in|at|domain|website)\s+.*)?$/i,
    );
    if (createCompanyMatch?.[1]) {
      return this.hubspot.createCompany(userId, {
        name: createCompanyMatch[1].trim(),
        domain: undefined,
        phone: undefined,
        industry: undefined,
        city: undefined,
        state: undefined,
        country: undefined,
        numberOfEmployees: undefined,
        description: undefined,
        website: undefined,
      });
    }
    const findCompanyMatch = command.match(
      /\b(?:find|look\s+up|show\s+me|search\s+for)\s+(?:the\s+)?(?:compan(?:y|ies)|account|organi[sz]ation)\s+"?([^",]+?)"?$/i,
    );
    if (findCompanyMatch?.[1]) {
      return this.hubspot.findCompany(userId, { name: findCompanyMatch[1].trim() });
    }
    const deleteCompanyMatch = command.match(
      /\b(?:delete|remove|drop)\s+(?:the\s+)?(?:compan(?:y|ies)|account|organi[sz]ation)\s+"?([^",]+?)"?$/i,
    );
    if (deleteCompanyMatch?.[1]) {
      return this.hubspot.deleteCompany(userId, { name: deleteCompanyMatch[1].trim() });
    }

    return {
      response:
        'I can show your HubSpot contacts, deals, companies, tickets, or products. Try "pull up my contacts", "list my deals", "what companies do I have", "show my tickets", "show my products", or "create a ticket titled Login bug".',
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
      response:
        `Here are the contacts you've added most recently in GoHighLevel:\n${summaries
          .map((c) => this.formatContact(c))
          .join('\n')}\n\n` +
        "Want a closer look at someone? Just say their name and I'll pull up the details.",
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
          ? `Found them in GoHighLevel:\n${this.formatContact(top)}\n\n` +
            "I'll keep them in mind — say \"update their phone\" or \"book them tomorrow\" and I'll know who you mean."
          : `Found ${matches.length} people in GoHighLevel — here are the closest matches:\n${matches
              .slice(0, 5)
              .map((c) => this.formatContact(c))
              .join('\n')}\n\n` +
            "Tell me which one you mean (a name, email, or phone) and I'll zero in.",
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
      response:
        `Done — ${created.name} is now in GoHighLevel${bits ? ` (${bits})` : ''}. ` +
        "I'll keep them in mind for follow-ups, so you can say things like " +
        '"update their phone" or "book them tomorrow at 2" and I\'ll know who you mean.',
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
      response:
        `All set — ${updated.name} is updated in GoHighLevel (${changed}). ` +
        "Want me to tweak something else on this contact, or pull up their full details?",
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
    return {
      response:
        `Done — ${matches[0].name} is removed from GoHighLevel. ` +
        "If that was a mistake, let me know and I can recreate them; otherwise, anything else you'd like me to tidy up?",
      status: 'success',
    };
  }

  private async listCalendars(userId: string): Promise<AssistantCommandResult> {
    const result = await this.ghl.listCalendars(userId);
    if (result.calendars.length === 0) {
      return { response: "You don't have any calendars set up in GoHighLevel yet.", status: 'success' };
    }
    return {
      response:
        `Here are the calendars on your GoHighLevel account:\n${result.calendars
          .map((c) => this.formatCalendar(c))
          .join('\n')}\n\n` +
        "Want me to check open slots, list upcoming appointments, or update one of these? Just say the word.",
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
      response:
        `Done — the "${created.name}" calendar is set up in GoHighLevel. ` +
        "I'll keep this calendar in mind, so you can say things like " +
        '"book Sarah on it tomorrow at 2" or "show available slots this week" and I\'ll know which one you mean.',
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
      response:
        `All set — the "${updated.name}" calendar is updated in GoHighLevel. ` +
        "Want me to tweak another field, check open slots, or list upcoming appointments on it?",
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
    return {
      response:
        `Done — the "${calendar.name}" calendar is removed from GoHighLevel. ` +
        "Any appointments that lived on it are still around in your account; let me know if you want me to clean those up too.",
      status: 'success',
    };
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
      days: range?.days ?? 60,
    });
    if (result.appointments.length === 0) {
      return { response: 'Nothing on the calendar for that window.', status: 'success' };
    }
    const top = result.appointments[0];
    return {
      response:
        `Here's what's coming up on your GoHighLevel calendar:\n${result.appointments
          .slice(0, 50)
          .map((a) => this.formatAppointment(a))
          .join('\n')}\n\n` +
        "Need to reschedule, cancel one, or book something new? Just say the word.",
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
      response:
        `Booked — ${created.title} is on the calendar for ${this.formatWhen(created.startTime)}. ` +
        "I'll keep this appointment in mind, so you can say things like " +
        '"cancel it", "move it to 3pm", or "reschedule that one" and I\'ll know which one you mean.',
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
      response:
        `Done — ${matches[0].title} on ${this.formatWhen(matches[0].startTime)} is canceled. ` +
        "Want me to rebook it for a different time, or send a quick note to the contact?",
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
      response:
        `Here are the pipelines on your GoHighLevel account:\n${pipelines
          .map((p) => this.formatPipeline(p))
          .join('\n')}\n\n` +
        "Want to see open opportunities in one of them, or create a new deal? Just point me at the pipeline.",
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
      response:
        `Here are the opportunities I'm seeing in GoHighLevel:\n${result.opportunities
          .slice(0, 10)
          .map((o) => this.formatOpportunity(o))
          .join('\n')}\n\n` +
        "Want me to drill into one (\"show the Acme deal\"), update a status, or add a new one? I'm ready when you are.",
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
          ? `Found it in GoHighLevel:\n${this.formatOpportunity(top)}\n\n` +
            "I'll keep this deal in mind — say \"mark it won\", \"update its value\", or \"move it to Negotiation\" and I'll know which one you mean."
          : `Found ${matches.length} matches in GoHighLevel — here's the top of the list:\n${matches
              .slice(0, 5)
              .map((o) => this.formatOpportunity(o))
              .join('\n')}\n\n` +
            "Tell me which one you mean (the deal name works) and I'll zero in.",
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
    const requiredOrder: ('contact' | 'name' | 'monetaryValue' | 'pipeline')[] = [
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
      response:
        `Done — the "${created.name}" opportunity is in GoHighLevel${bits ? ` ${bits}` : ''}. ` +
        "I'll keep this deal in mind, so you can say things like " +
        '"mark it won", "update its value", or "move it to Negotiation" and I\'ll know which one you mean.',
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
      response:
        `All set — the "${updated.name}" opportunity is updated in GoHighLevel. ` +
        "Want me to change another field, mark it won, or move it to a different stage?",
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
      response:
        `Done — "${updated.name}" is now marked ${updated.status} in GoHighLevel. ` +
        "Want me to log a note on it, update the amount, or move it to a different stage next?",
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
      response:
        `Done — the "${target.opportunity.name}" opportunity is removed from GoHighLevel. ` +
        "If that was a mistake, let me know and I can recreate it; otherwise, anything else you'd like me to clean up?",
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

  private formatAppointment(appointment: GhlAppointmentSummary) {
    // One bullet line per appointment, matching the contact/opportunity style
    // so the polish pass can render the set as a table. Skip any field the CRM
    // didn't populate (e.g. owner when the /users scope isn't granted).
    const bits: string[] = [];
    const when = this.formatWhen(appointment.startTime);
    if (when) bits.push(when);
    if (appointment.contactName) bits.push(`Contact: ${appointment.contactName}`);
    if (appointment.calendarName) bits.push(`Calendar: ${appointment.calendarName}`);
    if (appointment.ownerName) bits.push(`Owner: ${appointment.ownerName}`);
    if (appointment.status) bits.push(`Status: ${appointment.status}`);
    const detail = bits.join(' · ');
    return detail ? `· ${appointment.title} — ${detail}` : `· ${appointment.title}`;
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
