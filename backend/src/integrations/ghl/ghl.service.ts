import { Injectable } from '@nestjs/common';

import { AppointmentsService } from './appointments/appointments.service';
import { CalendarsService } from './calendars/calendars.service';
import { ContactsService } from './contacts/contacts.service';
import { ConversationsService } from './conversations/conversations.service';
import { OpportunitiesService } from './opportunities/opportunities.service';
import { PipelinesService } from './pipelines/pipelines.service';
import { GhlApiService } from './shared/ghl-api.service';

/** Backward-compatible fa�ade for application services that span GHL domains. */
@Injectable()
export class GhlService {
  constructor(
    private readonly api: GhlApiService,
    private readonly contacts: ContactsService,
    private readonly calendars: CalendarsService,
    private readonly appointments: AppointmentsService,
    private readonly opportunities: OpportunitiesService,
    private readonly pipelines: PipelinesService,
    private readonly conversations: ConversationsService,
  ) {}

  buildAuthUrl(...args: Parameters<GhlApiService['buildAuthUrl']>) { return this.api.buildAuthUrl(...args); }
  resolveReturnUrl(...args: Parameters<GhlApiService['resolveReturnUrl']>) { return this.api.resolveReturnUrl(...args); }
  handleCallback(...args: Parameters<GhlApiService['handleCallback']>) { return this.api.handleCallback(...args); }
  getStatus(...args: Parameters<GhlApiService['getStatus']>) { return this.api.getStatus(...args); }
  disconnect(...args: Parameters<GhlApiService['disconnect']>) { return this.api.disconnect(...args); }
  reconnect(...args: Parameters<GhlApiService['reconnect']>) { return this.api.reconnect(...args); }
  getValidAccessToken(...args: Parameters<GhlApiService['getValidAccessToken']>) { return this.api.getValidAccessToken(...args); }
  ghlRequest<T>(...args: Parameters<GhlApiService['ghlRequest']>) { return this.api.ghlRequest<T>(...args); }
  requireConversationScopes(...args: Parameters<GhlApiService['requireConversationScopes']>) { return this.api.requireConversationScopes(...args); }
  getDeepLinkScheme(...args: Parameters<GhlApiService['getDeepLinkScheme']>) { return this.api.getDeepLinkScheme(...args); }

  listContacts(...args: Parameters<ContactsService['listContacts']>) { return this.contacts.listContacts(...args); }
  listAllContacts(...args: Parameters<ContactsService['listAllContacts']>) { return this.contacts.listAllContacts(...args); }
  searchContacts(...args: Parameters<ContactsService['searchContacts']>) { return this.contacts.searchContacts(...args); }
  getContact(...args: Parameters<ContactsService['getContact']>) { return this.contacts.getContact(...args); }
  createContact(...args: Parameters<ContactsService['createContact']>) { return this.contacts.createContact(...args); }
  upsertContact(...args: Parameters<ContactsService['upsertContact']>) { return this.contacts.upsertContact(...args); }
  updateContact(...args: Parameters<ContactsService['updateContact']>) { return this.contacts.updateContact(...args); }
  deleteContact(...args: Parameters<ContactsService['deleteContact']>) { return this.contacts.deleteContact(...args); }

  listCalendars(...args: Parameters<CalendarsService['listCalendars']>) { return this.calendars.listCalendars(...args); }
  getCalendar(...args: Parameters<CalendarsService['getCalendar']>) { return this.calendars.getCalendar(...args); }
  createCalendar(...args: Parameters<CalendarsService['createCalendar']>) { return this.calendars.createCalendar(...args); }
  updateCalendar(...args: Parameters<CalendarsService['updateCalendar']>) { return this.calendars.updateCalendar(...args); }
  deleteCalendar(...args: Parameters<CalendarsService['deleteCalendar']>) { return this.calendars.deleteCalendar(...args); }
  getCalendarFreeSlots(...args: Parameters<CalendarsService['getCalendarFreeSlots']>) { return this.calendars.getCalendarFreeSlots(...args); }

  listCalendarEvents(...args: Parameters<AppointmentsService['listCalendarEvents']>) { return this.appointments.listCalendarEvents(...args); }
  createAppointment(...args: Parameters<AppointmentsService['createAppointment']>) { return this.appointments.createAppointment(...args); }
  cancelAppointment(...args: Parameters<AppointmentsService['cancelAppointment']>) { return this.appointments.cancelAppointment(...args); }

  listPipelines(...args: Parameters<PipelinesService['listPipelines']>) { return this.pipelines.listPipelines(...args); }

  listOpportunities(...args: Parameters<OpportunitiesService['listOpportunities']>) { return this.opportunities.listOpportunities(...args); }
  getOpportunity(...args: Parameters<OpportunitiesService['getOpportunity']>) { return this.opportunities.getOpportunity(...args); }
  createOpportunity(...args: Parameters<OpportunitiesService['createOpportunity']>) { return this.opportunities.createOpportunity(...args); }
  updateOpportunity(...args: Parameters<OpportunitiesService['updateOpportunity']>) { return this.opportunities.updateOpportunity(...args); }
  updateOpportunityStatus(...args: Parameters<OpportunitiesService['updateOpportunityStatus']>) { return this.opportunities.updateOpportunityStatus(...args); }
  deleteOpportunity(...args: Parameters<OpportunitiesService['deleteOpportunity']>) { return this.opportunities.deleteOpportunity(...args); }

  searchConversations(...args: Parameters<ConversationsService['searchConversations']>) { return this.conversations.searchConversations(...args); }
  getConversation(...args: Parameters<ConversationsService['getConversation']>) { return this.conversations.getConversation(...args); }
  getMessages(...args: Parameters<ConversationsService['getMessages']>) { return this.conversations.getMessages(...args); }
  updateConversation(...args: Parameters<ConversationsService['updateConversation']>) { return this.conversations.updateConversation(...args); }
  sendMessage(...args: Parameters<ConversationsService['sendMessage']>) { return this.conversations.sendMessage(...args); }
  createConversation(...args: Parameters<ConversationsService['createConversation']>) { return this.conversations.createConversation(...args); }
  getGhlUserId(...args: Parameters<ConversationsService['getGhlUserId']>) { return this.conversations.getGhlUserId(...args); }
}
