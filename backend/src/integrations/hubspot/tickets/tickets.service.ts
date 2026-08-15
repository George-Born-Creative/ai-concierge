import { BadRequestException, Injectable } from '@nestjs/common';

import { HubspotApiClient } from '../hubspot-api.client';
import { HubspotAssociationsService } from '../hubspot-associations.service';
import { HubspotPipeline, HubspotPipelinesService } from '../hubspot-pipelines.service';
import {
  HubspotPagedResponse,
  HubspotPaginated,
  HubspotRawObject,
  HubspotSearchResponse,
  HubspotTicketSummary,
} from '../hubspot.types';

const TICKET_PROPERTIES = [
  'subject',
  'content',
  'hs_ticket_priority',
  'hs_pipeline',
  'hs_pipeline_stage',
  'hubspot_owner_id',
  'hs_pinned_engagement_id',
] as const;

export type HubspotTicketCreateAssociation = {
  toId: string;
  types: {
    associationCategory: 'HUBSPOT_DEFINED' | 'USER_DEFINED' | 'INTEGRATOR_DEFINED';
    associationTypeId: number;
  }[];
};

export type HubspotTicketWriteInput = {
  subject?: string;
  content?: string | null;
  priority?: string | null;
  pipeline?: string;
  stage?: string;
  ownerId?: string | null;
  pinnedEngagementId?: string | null;
  properties?: Record<string, string | null>;
  associations?: HubspotTicketCreateAssociation[];
};

export type HubspotTicketDetail = HubspotTicketSummary & {
  properties: Record<string, string | null | undefined>;
  propertiesWithHistory?: Record<string, unknown>;
  associations?: Record<string, unknown>;
};

export type HubspotTicketBatchResponse = {
  status?: string;
  requestedAt?: string;
  startedAt?: string;
  completedAt?: string;
  results: HubspotTicketSummary[];
  errors?: unknown[];
  links?: Record<string, string>;
};

type RawBatchResponse = Omit<HubspotTicketBatchResponse, 'results'> & {
  results?: HubspotRawObject[];
};

type TicketReadOptions = {
  idProperty?: string;
  properties?: string[];
  propertiesWithHistory?: string[];
  associations?: string[];
  archived?: boolean;
};

type TicketSearchOptions = {
  q?: string;
  limit?: number;
  after?: string;
  priority?: string;
  pipeline?: string;
  stage?: string;
  ownerId?: string;
  sort?: 'updated_desc' | 'updated_asc' | 'created_desc' | 'created_asc';
};

@Injectable()
export class HubspotTicketsService {
  constructor(
    private readonly api: HubspotApiClient,
    private readonly associations: HubspotAssociationsService,
    private readonly pipelines: HubspotPipelinesService,
  ) {}

  async list(
    userId: string,
    options: { limit?: number; after?: string } & TicketReadOptions = {},
  ): Promise<HubspotPaginated<HubspotTicketSummary>> {
    const [data, pipelines] = await Promise.all([
      this.api.request<HubspotPagedResponse>(userId, 'GET', '/crm/v3/objects/tickets', {
        query: {
          limit: options.limit ?? 25,
          after: options.after,
          archived: options.archived,
          properties: this.readProperties(options.properties).join(','),
          propertiesWithHistory: options.propertiesWithHistory?.join(','),
          associations: options.associations?.join(','),
        },
      }),
      this.readPipelines(userId),
    ]);
    return this.toPage(data, pipelines);
  }

  async search(
    userId: string,
    options: TicketSearchOptions,
  ): Promise<HubspotPaginated<HubspotTicketSummary>> {
    const filters = [
      pair('hs_ticket_priority', options.priority),
      pair('hs_pipeline', options.pipeline),
      pair('hs_pipeline_stage', options.stage),
      pair('hubspot_owner_id', options.ownerId),
    ].filter((value): value is { propertyName: string; operator: 'EQ'; value: string } => Boolean(value));
    const query = options.q?.trim();
    if (!query && filters.length === 0) {
      throw new BadRequestException('Provide a search query or at least one ticket filter.');
    }
    const sort = {
      updated_desc: '-hs_lastmodifieddate',
      updated_asc: 'hs_lastmodifieddate',
      created_desc: '-createdate',
      created_asc: 'createdate',
    }[options.sort ?? 'updated_desc'];
    const [data, pipelines] = await Promise.all([
      this.api.request<HubspotSearchResponse>(userId, 'POST', '/crm/v3/objects/tickets/search', {
        body: {
          ...(query ? { query } : {}),
          ...(filters.length ? { filterGroups: [{ filters }] } : {}),
          limit: options.limit ?? 25,
          after: options.after,
          properties: [...TICKET_PROPERTIES],
          sorts: [sort],
        },
      }),
      this.readPipelines(userId),
    ]);
    return this.toPage(data, pipelines);
  }

  async getById(
    userId: string,
    id: string,
    idProperty = 'id',
  ): Promise<HubspotTicketSummary> {
    const row = await this.getRaw(userId, id, { idProperty });
    return this.toSummary(row, await this.readPipelines(userId));
  }

  async getDetail(
    userId: string,
    id: string,
    options: TicketReadOptions = {},
  ): Promise<HubspotTicketDetail> {
    const row = await this.getRaw(userId, id, options);
    return {
      ...this.toSummary(row, await this.readPipelines(userId)),
      properties: row.properties ?? {},
      propertiesWithHistory: row.propertiesWithHistory,
      associations: row.associations,
    };
  }

  listPipelines(userId: string): Promise<HubspotPipeline[]> {
    return this.pipelines.list(userId, 'tickets');
  }

  listProperties(userId: string): Promise<unknown> {
    return this.api.request(userId, 'GET', '/crm/v3/properties/tickets');
  }

  async create(userId: string, input: HubspotTicketWriteInput): Promise<HubspotTicketSummary> {
    const properties = await this.toCreateProperties(userId, input);
    const data = await this.api.request<HubspotRawObject>(
      userId,
      'POST',
      '/crm/v3/objects/tickets',
      {
        body: {
          properties,
          ...(input.associations?.length
            ? { associations: this.toCreateAssociations(input.associations) }
            : {}),
        },
      },
    );
    if (!data.id) throw new BadRequestException('HubSpot create response did not include a ticket id.');
    return this.getById(userId, data.id);
  }

  async update(
    userId: string,
    id: string,
    input: HubspotTicketWriteInput,
    idProperty = 'id',
  ): Promise<HubspotTicketSummary> {
    const ticketId = this.requireId(id);
    const properties = await this.toUpdateProperties(userId, input);
    if (Object.keys(properties).length === 0) {
      throw new BadRequestException('At least one property is required.');
    }
    const data = await this.api.request<HubspotRawObject>(
      userId,
      'PATCH',
      `/crm/v3/objects/tickets/${encodeURIComponent(ticketId)}`,
      {
        query: { idProperty: idProperty === 'id' ? undefined : idProperty },
        body: { properties },
      },
    );
    if (!data.id) throw new BadRequestException('HubSpot update response did not include a ticket id.');
    return this.getById(userId, data.id);
  }

  async archive(userId: string, id: string): Promise<void> {
    await this.api.request<void>(
      userId,
      'DELETE',
      `/crm/v3/objects/tickets/${encodeURIComponent(this.requireId(id))}`,
    );
  }

  delete(userId: string, id: string): Promise<void> {
    return this.archive(userId, id);
  }

  associateContact(userId: string, ticketId: string, contactId: string) {
    return this.associate(userId, ticketId, 'contacts', contactId);
  }

  disassociateContact(userId: string, ticketId: string, contactId: string) {
    return this.disassociate(userId, ticketId, 'contacts', contactId);
  }

  associateCompany(userId: string, ticketId: string, companyId: string) {
    return this.associate(userId, ticketId, 'companies', companyId);
  }

  disassociateCompany(userId: string, ticketId: string, companyId: string) {
    return this.disassociate(userId, ticketId, 'companies', companyId);
  }

  associateDeal(userId: string, ticketId: string, dealId: string) {
    return this.associate(userId, ticketId, 'deals', dealId);
  }

  disassociateDeal(userId: string, ticketId: string, dealId: string) {
    return this.disassociate(userId, ticketId, 'deals', dealId);
  }

  async associate(
    userId: string,
    ticketId: string,
    toObjectType: string,
    toObjectId: string,
    associationTypeId?: number,
  ): Promise<{ ok: true }> {
    if (!associationTypeId) {
      return this.associations.associate(userId, 'tickets', ticketId, toObjectType, toObjectId);
    }
    const ids = this.requireAssociation(ticketId, toObjectType, toObjectId);
    await this.api.request<void>(
      userId,
      'PUT',
      `/crm/v3/objects/tickets/${encodeURIComponent(ids.ticketId)}/associations/${encodeURIComponent(
        ids.toObjectType,
      )}/${encodeURIComponent(ids.toObjectId)}/${associationTypeId}`,
    );
    return { ok: true };
  }

  async disassociate(
    userId: string,
    ticketId: string,
    toObjectType: string,
    toObjectId: string,
    associationTypeId?: number,
  ): Promise<{ ok: true }> {
    if (!associationTypeId) {
      return this.associations.disassociate(userId, 'tickets', ticketId, toObjectType, toObjectId);
    }
    const ids = this.requireAssociation(ticketId, toObjectType, toObjectId);
    await this.api.request<void>(
      userId,
      'DELETE',
      `/crm/v3/objects/tickets/${encodeURIComponent(ids.ticketId)}/associations/${encodeURIComponent(
        ids.toObjectType,
      )}/${encodeURIComponent(ids.toObjectId)}/${associationTypeId}`,
    );
    return { ok: true };
  }

  listAssociationLabels(userId: string, toObjectType: string): Promise<unknown> {
    const type = this.requireObjectType(toObjectType);
    return this.api.request(
      userId,
      'GET',
      `/crm/v4/associations/tickets/${encodeURIComponent(type)}/labels`,
    );
  }

  async batchRead(
    userId: string,
    input: {
      ids: string[];
      idProperty?: string;
      properties?: string[];
      propertiesWithHistory?: string[];
    },
  ): Promise<HubspotTicketBatchResponse> {
    this.requireBatch(input.ids);
    const data = await this.api.request<RawBatchResponse>(
      userId,
      'POST',
      '/crm/v3/objects/tickets/batch/read',
      {
        body: {
          inputs: input.ids.map((id) => ({ id: id.trim() })),
          properties: input.properties?.length ? input.properties : [...TICKET_PROPERTIES],
          ...(input.propertiesWithHistory?.length
            ? { propertiesWithHistory: input.propertiesWithHistory }
            : {}),
          ...(input.idProperty ? { idProperty: input.idProperty } : {}),
        },
      },
    );
    return this.toBatch(data, await this.readPipelines(userId));
  }

  async batchUpdate(
    userId: string,
    inputs: { id: string; idProperty?: string; properties: HubspotTicketWriteInput }[],
  ): Promise<HubspotTicketBatchResponse> {
    this.requireBatch(inputs.map((input) => input.id));
    const normalized = await Promise.all(
      inputs.map(async (input) => ({
        id: input.id.trim(),
        ...(input.idProperty ? { idProperty: input.idProperty } : {}),
        properties: await this.toUpdateProperties(userId, input.properties),
      })),
    );
    if (normalized.some((input) => Object.keys(input.properties).length === 0)) {
      throw new BadRequestException('Every batch update must include at least one property.');
    }
    const data = await this.api.request<RawBatchResponse>(
      userId,
      'POST',
      '/crm/v3/objects/tickets/batch/update',
      { body: { inputs: normalized } },
    );
    return this.toBatch(data, await this.readPipelines(userId));
  }

  async batchArchive(userId: string, ids: string[]): Promise<void> {
    this.requireBatch(ids);
    await this.api.request<void>(userId, 'POST', '/crm/v3/objects/tickets/batch/archive', {
      body: { inputs: ids.map((id) => ({ id: id.trim() })) },
    });
  }

  private async getRaw(userId: string, id: string, options: TicketReadOptions) {
    const ticketId = this.requireId(id);
    return this.api.request<HubspotRawObject>(
      userId,
      'GET',
      `/crm/v3/objects/tickets/${encodeURIComponent(ticketId)}`,
      {
        query: {
          idProperty: options.idProperty && options.idProperty !== 'id' ? options.idProperty : undefined,
          archived: options.archived,
          properties: this.readProperties(options.properties).join(','),
          propertiesWithHistory: options.propertiesWithHistory?.join(','),
          associations: options.associations?.join(','),
        },
      },
    );
  }

  private async toCreateProperties(userId: string, input: HubspotTicketWriteInput) {
    const properties = this.toProperties(input, false);
    if (!properties.subject?.trim()) throw new BadRequestException('A ticket subject is required.');
    const resolved = await this.pipelines.resolve(userId, 'tickets', input.pipeline, input.stage);
    properties.hs_pipeline = resolved.pipeline.id;
    properties.hs_pipeline_stage = resolved.stage.id;
    return properties;
  }

  private async toUpdateProperties(userId: string, input: HubspotTicketWriteInput) {
    const properties = this.toProperties(input, true);
    if (input.pipeline !== undefined || input.stage !== undefined) {
      const resolved = await this.pipelines.resolve(userId, 'tickets', input.pipeline, input.stage);
      properties.hs_pipeline = resolved.pipeline.id;
      properties.hs_pipeline_stage = resolved.stage.id;
    }
    return properties;
  }

  private toProperties(input: HubspotTicketWriteInput, preserveEmpty: boolean) {
    const properties: Record<string, string> = {};
    for (const [key, value] of Object.entries(input.properties ?? {})) {
      if (!key.trim()) continue;
      properties[key.trim()] = value === null ? '' : String(value);
    }
    const assign = (key: string, value: string | null | undefined) => {
      if (value === undefined) return;
      const normalized = value === null ? '' : value.trim();
      if (preserveEmpty || normalized) properties[key] = normalized;
    };
    assign('subject', input.subject);
    assign('content', input.content);
    assign('hs_ticket_priority', input.priority?.toUpperCase() ?? input.priority);
    assign('hubspot_owner_id', input.ownerId);
    assign('hs_pinned_engagement_id', input.pinnedEngagementId);
    return properties;
  }

  private toCreateAssociations(associations: HubspotTicketCreateAssociation[]) {
    return associations.map((association) => ({
      to: { id: this.requireId(association.toId) },
      types: association.types,
    }));
  }

  private toPage(
    data: HubspotPagedResponse | HubspotSearchResponse,
    pipelines: HubspotPipeline[],
  ): HubspotPaginated<HubspotTicketSummary> {
    return {
      results: (data.results ?? []).map((row) => this.toSummary(row, pipelines)),
      after: data.paging?.next?.after ?? null,
      ...('total' in data && typeof data.total === 'number' ? { total: data.total } : {}),
    };
  }

  private toBatch(data: RawBatchResponse, pipelines: HubspotPipeline[]) {
    return { ...data, results: (data.results ?? []).map((row) => this.toSummary(row, pipelines)) };
  }

  private toSummary(row: HubspotRawObject, pipelines: HubspotPipeline[]): HubspotTicketSummary {
    const props = row.properties ?? {};
    const pipeline = clean(props.hs_pipeline);
    const stage = clean(props.hs_pipeline_stage);
    const labels = this.pipelines.findLabels(pipelines, pipeline, stage);
    return {
      id: row.id,
      subject: clean(props.subject) ?? 'Untitled ticket',
      content: clean(props.content),
      priority: clean(props.hs_ticket_priority),
      pipeline,
      pipelineLabel: labels.pipelineLabel,
      stage,
      stageLabel: labels.stageLabel,
      ownerId: clean(props.hubspot_owner_id),
      pinnedEngagementId: clean(props.hs_pinned_engagement_id),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async readPipelines(userId: string): Promise<HubspotPipeline[]> {
    try {
      return await this.pipelines.list(userId, 'tickets');
    } catch {
      return [];
    }
  }

  private readProperties(properties?: string[]) {
    return unique([...TICKET_PROPERTIES, ...(properties ?? [])]);
  }

  private requireId(id: string): string {
    const value = id?.trim();
    if (!value) throw new BadRequestException('Ticket id is required.');
    return value;
  }

  private requireBatch(ids: string[]) {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) {
      throw new BadRequestException('Ticket batch operations require between 1 and 100 records.');
    }
    if (ids.some((id) => !id?.trim())) {
      throw new BadRequestException('Every ticket batch input requires an id.');
    }
  }

  private requireObjectType(value: string): string {
    const type = value?.trim();
    if (!type || !/^[a-zA-Z0-9_-]+$/.test(type)) {
      throw new BadRequestException('A valid associated object type is required.');
    }
    return type;
  }

  private requireAssociation(ticketId: string, toObjectType: string, toObjectId: string) {
    return {
      ticketId: this.requireId(ticketId),
      toObjectType: this.requireObjectType(toObjectType),
      toObjectId: this.requireId(toObjectId),
    };
  }
}

function clean(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function unique(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function pair(propertyName: string, value?: string) {
  const normalized = value?.trim();
  return normalized ? { propertyName, operator: 'EQ' as const, value: normalized } : undefined;
}
