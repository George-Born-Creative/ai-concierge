import { BadRequestException, Injectable } from '@nestjs/common';

import { HubspotApiClient } from '../hubspot-api.client';
import {
  HubspotPagedResponse,
  HubspotPaginated,
  HubspotRawObject,
  HubspotSearchResponse,
  HubspotTicketSummary,
} from '../hubspot.types';

/**
 * Property allow-list requested from HubSpot on every ticket read. HubSpot
 * otherwise returns a tiny default set, so anything surfaced in
 * `HubspotTicketSummary` must be listed here. Names are HubSpot's lowercase
 * property keys, not the camelCase shape we expose to clients.
 */
const TICKET_PROPERTIES = [
  'subject',
  'content',
  'hs_ticket_priority',
  'hs_pipeline',
  'hs_pipeline_stage',
  'hubspot_owner_id',
] as const;

/**
 * Shape accepted from controllers for create / update. CamelCase so the REST
 * surface matches the other HubSpot resources and the mobile app uses one
 * shared form. The service translates to HubSpot's lowercase property names in
 * `toHubspotProperties`.
 */
export type HubspotTicketWriteInput = {
  subject?: string;
  content?: string;
  priority?: string;
  pipeline?: string;
  stage?: string;
};

@Injectable()
export class HubspotTicketsService {
  constructor(private readonly api: HubspotApiClient) {}

  async list(
    userId: string,
    options: { limit?: number; after?: string } = {},
  ): Promise<HubspotPaginated<HubspotTicketSummary>> {
    const data = await this.api.request<HubspotPagedResponse>(
      userId,
      'GET',
      '/crm/v3/objects/tickets',
      {
        query: {
          limit: options.limit ?? 25,
          after: options.after,
          properties: TICKET_PROPERTIES.join(','),
        },
      },
    );

    return {
      results: (data.results ?? []).map((row) => this.toSummary(row)),
      after: data.paging?.next?.after ?? null,
    };
  }

  async search(
    userId: string,
    options: { q: string; limit?: number; after?: string },
  ): Promise<HubspotPaginated<HubspotTicketSummary>> {
    const query = options.q.trim();
    if (!query) {
      throw new BadRequestException('Search query cannot be empty.');
    }

    const data = await this.api.request<HubspotSearchResponse>(
      userId,
      'POST',
      '/crm/v3/objects/tickets/search',
      {
        body: {
          query,
          limit: options.limit ?? 25,
          after: options.after,
          properties: TICKET_PROPERTIES,
          sorts: [
            { propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' },
          ],
        },
      },
    );

    return {
      results: (data.results ?? []).map((row) => this.toSummary(row)),
      after: data.paging?.next?.after ?? null,
    };
  }

  async getById(userId: string, id: string): Promise<HubspotTicketSummary> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw new BadRequestException('Ticket id is required.');
    }
    const data = await this.api.request<HubspotRawObject>(
      userId,
      'GET',
      `/crm/v3/objects/tickets/${encodeURIComponent(trimmed)}`,
      {
        query: { properties: TICKET_PROPERTIES.join(',') },
      },
    );
    return this.toSummary(data);
  }

  // ── Writes ─────────────────────────────────────────────────────────────────
  //
  // HubSpot stores all CRM data as `properties` on the object. We accept a
  // camelCase shape and translate to HubSpot's lowercase property names at the
  // API boundary so the rest of the codebase never has to care about HubSpot's
  // internal names.

  async create(
    userId: string,
    input: HubspotTicketWriteInput,
  ): Promise<HubspotTicketSummary> {
    const properties = this.toHubspotProperties(input);
    // HubSpot requires a subject on ticket create; a pipeline + stage are also
    // required by the API. Default to the standard Support Pipeline (id `0`)
    // and its first stage ("New", id `1`) when the caller doesn't specify one.
    if (!properties.subject) {
      throw new BadRequestException('A ticket subject is required.');
    }
    if (!properties.hs_pipeline) properties.hs_pipeline = '0';
    if (!properties.hs_pipeline_stage) properties.hs_pipeline_stage = '1';

    const data = await this.api.request<HubspotRawObject>(
      userId,
      'POST',
      '/crm/v3/objects/tickets',
      { body: { properties } },
    );
    return this.toSummary(data);
  }

  async update(
    userId: string,
    id: string,
    input: HubspotTicketWriteInput,
  ): Promise<HubspotTicketSummary> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw new BadRequestException('Ticket id is required.');
    }
    const properties = this.toHubspotProperties(input);
    if (Object.keys(properties).length === 0) {
      throw new BadRequestException('At least one property is required.');
    }
    const data = await this.api.request<HubspotRawObject>(
      userId,
      'PATCH',
      `/crm/v3/objects/tickets/${encodeURIComponent(trimmed)}`,
      {
        query: { properties: TICKET_PROPERTIES.join(',') },
        body: { properties },
      },
    );
    return this.toSummary(data);
  }

  async delete(userId: string, id: string): Promise<void> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw new BadRequestException('Ticket id is required.');
    }
    await this.api.request<void>(
      userId,
      'DELETE',
      `/crm/v3/objects/tickets/${encodeURIComponent(trimmed)}`,
    );
  }

  // ── Associations (v4) ──────────────────────────────────────────────────────
  //
  // HubSpot's v4 associations API. The `/default/` path lets HubSpot pick the
  // standard association label for the pair so we don't have to hard-code
  // numeric association-type ids that vary per portal. Delete drops every
  // association between the two objects regardless of label — idempotent.

  async associateContact(
    userId: string,
    ticketId: string,
    contactId: string,
  ): Promise<{ ok: true }> {
    return this.associate(userId, ticketId, 'contacts', contactId);
  }

  async disassociateContact(
    userId: string,
    ticketId: string,
    contactId: string,
  ): Promise<{ ok: true }> {
    return this.disassociate(userId, ticketId, 'contacts', contactId);
  }

  async associateCompany(
    userId: string,
    ticketId: string,
    companyId: string,
  ): Promise<{ ok: true }> {
    return this.associate(userId, ticketId, 'companies', companyId);
  }

  async disassociateCompany(
    userId: string,
    ticketId: string,
    companyId: string,
  ): Promise<{ ok: true }> {
    return this.disassociate(userId, ticketId, 'companies', companyId);
  }

  async associateDeal(
    userId: string,
    ticketId: string,
    dealId: string,
  ): Promise<{ ok: true }> {
    return this.associate(userId, ticketId, 'deals', dealId);
  }

  async disassociateDeal(
    userId: string,
    ticketId: string,
    dealId: string,
  ): Promise<{ ok: true }> {
    return this.disassociate(userId, ticketId, 'deals', dealId);
  }

  private async associate(
    userId: string,
    ticketId: string,
    toObjectType: 'contacts' | 'companies' | 'deals',
    toObjectId: string,
  ): Promise<{ ok: true }> {
    const ticketIdTrimmed = ticketId?.trim();
    const toIdTrimmed = toObjectId?.trim();
    if (!ticketIdTrimmed) {
      throw new BadRequestException('Ticket id is required.');
    }
    if (!toIdTrimmed) {
      throw new BadRequestException(`${labelFor(toObjectType)} id is required.`);
    }
    await this.api.request<void>(
      userId,
      'PUT',
      `/crm/v4/objects/tickets/${encodeURIComponent(
        ticketIdTrimmed,
      )}/associations/default/${toObjectType}/${encodeURIComponent(toIdTrimmed)}`,
    );
    return { ok: true };
  }

  private async disassociate(
    userId: string,
    ticketId: string,
    toObjectType: 'contacts' | 'companies' | 'deals',
    toObjectId: string,
  ): Promise<{ ok: true }> {
    const ticketIdTrimmed = ticketId?.trim();
    const toIdTrimmed = toObjectId?.trim();
    if (!ticketIdTrimmed) {
      throw new BadRequestException('Ticket id is required.');
    }
    if (!toIdTrimmed) {
      throw new BadRequestException(`${labelFor(toObjectType)} id is required.`);
    }
    await this.api.request<void>(
      userId,
      'DELETE',
      `/crm/v4/objects/tickets/${encodeURIComponent(
        ticketIdTrimmed,
      )}/associations/${toObjectType}/${encodeURIComponent(toIdTrimmed)}`,
    );
    return { ok: true };
  }

  // ── Mappers ────────────────────────────────────────────────────────────────

  private toHubspotProperties(
    input: HubspotTicketWriteInput,
  ): Record<string, string> {
    const props: Record<string, string> = {};
    if (input.subject !== undefined) props.subject = input.subject;
    if (input.content !== undefined) props.content = input.content;
    if (input.priority !== undefined) {
      props.hs_ticket_priority = input.priority.toUpperCase();
    }
    if (input.pipeline !== undefined) props.hs_pipeline = input.pipeline;
    if (input.stage !== undefined) props.hs_pipeline_stage = input.stage;
    return props;
  }

  private toSummary(row: HubspotRawObject): HubspotTicketSummary {
    const props = row.properties ?? {};
    return {
      id: row.id,
      subject: clean(props.subject) ?? 'Untitled ticket',
      content: clean(props.content),
      priority: clean(props.hs_ticket_priority),
      pipeline: clean(props.hs_pipeline),
      stage: clean(props.hs_pipeline_stage),
      ownerId: clean(props.hubspot_owner_id),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

function clean(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function labelFor(type: 'contacts' | 'companies' | 'deals'): string {
  if (type === 'contacts') return 'Contact';
  if (type === 'companies') return 'Company';
  return 'Deal';
}
