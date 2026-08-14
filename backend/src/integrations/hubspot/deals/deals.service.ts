import { BadRequestException, Injectable } from '@nestjs/common';

import { HubspotApiClient } from '../hubspot-api.client';
import { HubspotAssociationsService } from '../hubspot-associations.service';
import { HubspotPipeline, HubspotPipelinesService } from '../hubspot-pipelines.service';
import {
  HubspotDealSummary,
  HubspotPagedResponse,
  HubspotPaginated,
  HubspotRawObject,
  HubspotSearchResponse,
} from '../hubspot.types';

const DEAL_PROPERTIES = [
  'dealname', 'amount', 'deal_currency_code', 'pipeline', 'dealstage',
  'closedate', 'hubspot_owner_id', 'description', 'dealtype',
  'hs_all_collaborator_owner_ids', 'hs_pinned_engagement_id',
] as const;

export type HubspotDealIdProperty = 'id' | string;
export type HubspotDealCreateAssociation = {
  to: { id: string };
  types: {
    associationCategory: 'HUBSPOT_DEFINED' | 'USER_DEFINED' | 'INTEGRATOR_DEFINED';
    associationTypeId: number;
  }[];
};
export type HubspotDealWriteInput = {
  name?: string;
  amount?: number | null;
  currency?: string;
  pipeline?: string;
  stage?: string;
  closeDate?: string;
  ownerId?: string;
  collaboratorOwnerIds?: string[];
  description?: string;
  dealType?: string;
  pinnedEngagementId?: string;
  associations?: HubspotDealCreateAssociation[];
};
export type HubspotDealDetail = HubspotDealSummary & {
  properties: Record<string, string | null | undefined>;
  propertiesWithHistory?: Record<string, unknown>;
  associations?: Record<string, unknown>;
};
export type HubspotDealBatchResponse = {
  status?: string;
  requestedAt?: string;
  startedAt?: string;
  completedAt?: string;
  results: HubspotDealSummary[];
  errors?: unknown[];
  links?: Record<string, string>;
};
type RawBatchResponse = Omit<HubspotDealBatchResponse, 'results'> & {
  results?: HubspotRawObject[];
};

@Injectable()
export class HubspotDealsService {
  constructor(
    private readonly api: HubspotApiClient,
    private readonly pipelines: HubspotPipelinesService,
    private readonly associations: HubspotAssociationsService,
  ) {}

  async list(userId: string, options: { limit?: number; after?: string } = {}) {
    const [data, pipelines] = await Promise.all([
      this.api.request<HubspotPagedResponse>(userId, 'GET', '/crm/v3/objects/deals', {
        query: {
          limit: options.limit ?? 25,
          after: options.after,
          properties: DEAL_PROPERTIES.join(','),
        },
      }),
      this.readPipelines(userId),
    ]);
    return this.toPage(data, pipelines);
  }

  async listRecent(userId: string, options: { limit?: number; after?: string } = {}) {
    return this.searchRequest(userId, {
      limit: options.limit ?? 25,
      after: options.after,
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
    });
  }

  async search(
    userId: string,
    options: { q: string; limit?: number; after?: string },
  ): Promise<HubspotPaginated<HubspotDealSummary>> {
    const query = options.q?.trim();
    if (!query) throw new BadRequestException('Search query cannot be empty.');
    return this.searchRequest(userId, {
      query,
      limit: options.limit ?? 25,
      after: options.after,
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
    });
  }

  async getById(userId: string, id: string, idProperty: HubspotDealIdProperty = 'id') {
    const row = await this.getRaw(userId, id, idProperty);
    return this.toSummary(row, await this.readPipelines(userId));
  }

  async getDetail(
    userId: string,
    id: string,
    options: {
      idProperty?: HubspotDealIdProperty;
      properties?: string[];
      propertiesWithHistory?: string[];
      associations?: string[];
    } = {},
  ): Promise<HubspotDealDetail> {
    const trimmed = this.requireId(id);
    const row = await this.api.request<HubspotRawObject>(
      userId,
      'GET',
      `/crm/v3/objects/deals/${encodeURIComponent(trimmed)}`,
      {
        query: {
          idProperty: options.idProperty === 'id' ? undefined : options.idProperty,
          properties: unique([...DEAL_PROPERTIES, ...(options.properties ?? [])]).join(','),
          propertiesWithHistory: options.propertiesWithHistory?.join(','),
          associations: options.associations?.join(','),
        },
      },
    );
    return {
      ...this.toSummary(row, await this.readPipelines(userId)),
      properties: row.properties ?? {},
      propertiesWithHistory: row.propertiesWithHistory,
      associations: row.associations,
    };
  }

  listPipelines(userId: string): Promise<HubspotPipeline[]> {
    return this.pipelines.list(userId, 'deals');
  }

  async create(userId: string, input: HubspotDealWriteInput) {
    const properties = await this.toCreateProperties(userId, input);
    const data = await this.api.request<HubspotRawObject>(userId, 'POST', '/crm/v3/objects/deals', {
      body: {
        properties,
        ...(input.associations?.length ? { associations: input.associations } : {}),
      },
    });
    return this.toSummary(data, await this.readPipelines(userId));
  }

  async update(
    userId: string,
    id: string,
    input: HubspotDealWriteInput,
    idProperty: HubspotDealIdProperty = 'id',
  ) {
    const trimmed = this.requireId(id);
    const properties = await this.toUpdateProperties(userId, input);
    if (Object.keys(properties).length === 0) {
      throw new BadRequestException('At least one property is required.');
    }
    const data = await this.api.request<HubspotRawObject>(
      userId,
      'PATCH',
      `/crm/v3/objects/deals/${encodeURIComponent(trimmed)}`,
      {
        query: { idProperty: idProperty === 'id' ? undefined : idProperty },
        body: { properties },
      },
    );
    if (!data.id) throw new BadRequestException('HubSpot update response did not include a deal id.');
    return this.getById(userId, data.id);
  }

  async delete(userId: string, id: string): Promise<void> {
    const trimmed = this.requireId(id);
    await this.api.request<void>(userId, 'DELETE', `/crm/v3/objects/deals/${encodeURIComponent(trimmed)}`);
  }

  associate(userId: string, dealId: string, toType: string, toId: string) {
    return this.associations.associate(userId, 'deals', dealId, toType, toId);
  }

  disassociate(userId: string, dealId: string, toType: string, toId: string) {
    return this.associations.disassociate(userId, 'deals', dealId, toType, toId);
  }

  async batchRead(
    userId: string,
    input: {
      ids: string[];
      idProperty?: string;
      properties?: string[];
      propertiesWithHistory?: string[];
    },
  ): Promise<HubspotDealBatchResponse> {
    this.requireBatch(input.ids);
    const data = await this.api.request<RawBatchResponse>(
      userId,
      'POST',
      '/crm/v3/objects/deals/batch/read',
      {
        body: {
          inputs: input.ids.map((id) => ({ id: id.trim() })),
          properties: input.properties?.length ? input.properties : [...DEAL_PROPERTIES],
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
    inputs: { id: string; idProperty?: string; properties: HubspotDealWriteInput }[],
  ): Promise<HubspotDealBatchResponse> {
    this.requireBatch(inputs.map((input) => input.id));
    const normalized = await Promise.all(inputs.map(async (input) => ({
      id: input.id.trim(),
      ...(input.idProperty ? { idProperty: input.idProperty } : {}),
      properties: await this.toUpdateProperties(userId, input.properties),
    })));
    if (normalized.some((input) => Object.keys(input.properties).length === 0)) {
      throw new BadRequestException('Every batch update must include at least one property.');
    }
    const data = await this.api.request<RawBatchResponse>(
      userId,
      'POST',
      '/crm/v3/objects/deals/batch/update',
      { body: { inputs: normalized } },
    );
    return this.toBatch(data, await this.readPipelines(userId));
  }

  async batchArchive(userId: string, ids: string[]): Promise<void> {
    this.requireBatch(ids);
    await this.api.request<void>(userId, 'POST', '/crm/v3/objects/deals/batch/archive', {
      body: { inputs: ids.map((id) => ({ id: id.trim() })) },
    });
  }

  private async searchRequest(userId: string, body: Record<string, unknown>) {
    const [data, pipelines] = await Promise.all([
      this.api.request<HubspotSearchResponse>(
        userId,
        'POST',
        '/crm/v3/objects/deals/search',
        { body: { ...body, properties: DEAL_PROPERTIES } },
      ),
      this.readPipelines(userId),
    ]);
    return this.toPage(data, pipelines);
  }

  private async getRaw(userId: string, id: string, idProperty: HubspotDealIdProperty) {
    const trimmed = this.requireId(id);
    return this.api.request<HubspotRawObject>(
      userId,
      'GET',
      `/crm/v3/objects/deals/${encodeURIComponent(trimmed)}`,
      {
        query: {
          idProperty: idProperty === 'id' ? undefined : idProperty,
          properties: DEAL_PROPERTIES.join(','),
        },
      },
    );
  }

  private async toCreateProperties(userId: string, input: HubspotDealWriteInput) {
    const properties = this.toProperties(input, false);
    if (!properties.dealname) throw new BadRequestException('A deal name is required.');
    const resolved = await this.pipelines.resolve(userId, 'deals', input.pipeline, input.stage);
    properties.pipeline = resolved.pipeline.id;
    properties.dealstage = resolved.stage.id;
    return properties;
  }

  private async toUpdateProperties(userId: string, input: HubspotDealWriteInput) {
    const properties = this.toProperties(input, true);
    if (input.pipeline !== undefined || input.stage !== undefined) {
      const resolved = await this.pipelines.resolve(userId, 'deals', input.pipeline, input.stage);
      properties.pipeline = resolved.pipeline.id;
      properties.dealstage = resolved.stage.id;
    }
    return properties;
  }

  private toProperties(input: HubspotDealWriteInput, preserveEmpty: boolean) {
    const properties: Record<string, string> = {};
    const assign = (key: string, value: string | undefined) => {
      if (value === undefined) return;
      const normalized = value.trim();
      if (preserveEmpty || normalized) properties[key] = normalized;
    };
    assign('dealname', input.name);
    if (input.amount !== undefined) {
      properties.amount = input.amount === null ? '' : String(input.amount);
    }
    assign('deal_currency_code', input.currency);
    assign('closedate', input.closeDate);
    assign('hubspot_owner_id', input.ownerId);
    assign('description', input.description);
    assign('dealtype', input.dealType);
    assign('hs_pinned_engagement_id', input.pinnedEngagementId);
    if (input.collaboratorOwnerIds !== undefined) {
      properties.hs_all_collaborator_owner_ids = input.collaboratorOwnerIds.length
        ? `;${input.collaboratorOwnerIds.map((id) => id.trim()).filter(Boolean).join(';')};`
        : '';
    }
    return properties;
  }

  private toPage(
    data: HubspotPagedResponse | HubspotSearchResponse,
    pipelines: HubspotPipeline[],
  ): HubspotPaginated<HubspotDealSummary> {
    return {
      results: (data.results ?? []).map((row) => this.toSummary(row, pipelines)),
      after: data.paging?.next?.after ?? null,
    };
  }

  private toBatch(data: RawBatchResponse, pipelines: HubspotPipeline[]) {
    return { ...data, results: (data.results ?? []).map((row) => this.toSummary(row, pipelines)) };
  }

  private toSummary(row: HubspotRawObject, pipelines: HubspotPipeline[]): HubspotDealSummary {
    const properties = row.properties ?? {};
    const pipeline = clean(properties.pipeline);
    const stage = clean(properties.dealstage);
    const labels = this.pipelines.findLabels(pipelines, pipeline, stage);
    return {
      id: row.id,
      name: clean(properties.dealname) ?? 'Untitled deal',
      amount: toNumber(properties.amount),
      currency: clean(properties.deal_currency_code),
      pipeline,
      pipelineLabel: labels.pipelineLabel,
      stage,
      stageLabel: labels.stageLabel,
      closeDate: clean(properties.closedate),
      ownerId: clean(properties.hubspot_owner_id),
      description: clean(properties.description),
      dealType: clean(properties.dealtype),
      pinnedEngagementId: clean(properties.hs_pinned_engagement_id),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async readPipelines(userId: string): Promise<HubspotPipeline[]> {
    try { return await this.pipelines.list(userId, 'deals'); } catch { return []; }
  }

  private requireId(id: string): string {
    const trimmed = id?.trim();
    if (!trimmed) throw new BadRequestException('Deal id is required.');
    return trimmed;
  }

  private requireBatch(ids: string[]) {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) {
      throw new BadRequestException('Deal batch operations require between 1 and 100 records.');
    }
    if (ids.some((id) => !id?.trim())) {
      throw new BadRequestException('Every deal batch input requires an id.');
    }
  }
}

function clean(value: string | null | undefined) {
  if (value === null || value === undefined) return undefined;
  const trimmed = String(value).trim();
  return trimmed || undefined;
}
function toNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function unique(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
