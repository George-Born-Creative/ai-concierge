import { BadRequestException, Injectable } from '@nestjs/common';

import { HubspotApiClient } from '../hubspot-api.client';
import {
  HubspotOrderSummary,
  HubspotPagedResponse,
  HubspotPaginated,
  HubspotRawObject,
  HubspotSearchResponse,
} from '../hubspot.types';

/**
 * Property allow-list requested from HubSpot on every order read. HubSpot
 * otherwise returns a tiny default set, so anything surfaced in
 * `HubspotOrderSummary` must be listed here. Names are HubSpot's lowercase
 * property keys, not the camelCase shape we expose to clients.
 */
const ORDER_PROPERTIES = [
  'hs_order_name',
  'hs_total_price',
  'hs_currency_code',
  'hs_fulfillment_status',
  'hs_pipeline',
  'hs_pipeline_stage',
  'hubspot_owner_id',
  'hs_source_store',
] as const;

/**
 * Shape accepted from controllers for create / update. CamelCase so the REST
 * surface matches the other HubSpot resources and the mobile app uses one
 * shared form. The service translates to HubSpot's lowercase property names in
 * `toHubspotProperties`.
 */
export type HubspotOrderWriteInput = {
  name?: string;
  pipeline?: string;
  stage?: string;
  totalPrice?: number;
  currency?: string;
  status?: string;
  sourceStore?: string;
  ownerId?: string;
};

/** Shape of `GET /crm/v3/pipelines/orders`. */
type HubspotPipelinesResponse = {
  results?: {
    id: string;
    label?: string;
    displayOrder?: number;
    stages?: { id: string; label?: string; displayOrder?: number }[];
  }[];
};

@Injectable()
export class HubspotOrdersService {
  constructor(private readonly api: HubspotApiClient) {}

  async list(
    userId: string,
    options: { limit?: number; after?: string } = {},
  ): Promise<HubspotPaginated<HubspotOrderSummary>> {
    const data = await this.api.request<HubspotPagedResponse>(
      userId,
      'GET',
      '/crm/v3/objects/orders',
      {
        query: {
          limit: options.limit ?? 25,
          after: options.after,
          properties: ORDER_PROPERTIES.join(','),
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
  ): Promise<HubspotPaginated<HubspotOrderSummary>> {
    const query = options.q.trim();
    if (!query) {
      throw new BadRequestException('Search query cannot be empty.');
    }

    const data = await this.api.request<HubspotSearchResponse>(
      userId,
      'POST',
      '/crm/v3/objects/orders/search',
      {
        body: {
          query,
          limit: options.limit ?? 25,
          after: options.after,
          properties: ORDER_PROPERTIES,
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

  async getById(userId: string, id: string): Promise<HubspotOrderSummary> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw new BadRequestException('Order id is required.');
    }
    const data = await this.api.request<HubspotRawObject>(
      userId,
      'GET',
      `/crm/v3/objects/orders/${encodeURIComponent(trimmed)}`,
      {
        query: { properties: ORDER_PROPERTIES.join(',') },
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
    input: HubspotOrderWriteInput,
  ): Promise<HubspotOrderSummary> {
    const properties = this.toHubspotProperties(input);
    // HubSpot requires a name on order create.
    if (!properties.hs_order_name) {
      throw new BadRequestException('An order name is required.');
    }
    // HubSpot also requires a pipeline + stage (like deals). Pipeline/stage ids
    // vary per portal, so when the caller doesn't supply them, resolve the
    // first order pipeline and its first stage as sensible defaults.
    if (!properties.hs_pipeline || !properties.hs_pipeline_stage) {
      const fallback = await this.resolveDefaultPipelineStage(userId);
      if (fallback) {
        if (!properties.hs_pipeline) properties.hs_pipeline = fallback.pipeline;
        if (!properties.hs_pipeline_stage) {
          properties.hs_pipeline_stage = fallback.stage;
        }
      }
    }

    const data = await this.api.request<HubspotRawObject>(
      userId,
      'POST',
      '/crm/v3/objects/orders',
      { body: { properties } },
    );
    return this.toSummary(data);
  }

  async update(
    userId: string,
    id: string,
    input: HubspotOrderWriteInput,
  ): Promise<HubspotOrderSummary> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw new BadRequestException('Order id is required.');
    }
    const properties = this.toHubspotProperties(input);
    if (Object.keys(properties).length === 0) {
      throw new BadRequestException('At least one property is required.');
    }
    const data = await this.api.request<HubspotRawObject>(
      userId,
      'PATCH',
      `/crm/v3/objects/orders/${encodeURIComponent(trimmed)}`,
      {
        query: { properties: ORDER_PROPERTIES.join(',') },
        body: { properties },
      },
    );
    return this.toSummary(data);
  }

  async delete(userId: string, id: string): Promise<void> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw new BadRequestException('Order id is required.');
    }
    await this.api.request<void>(
      userId,
      'DELETE',
      `/crm/v3/objects/orders/${encodeURIComponent(trimmed)}`,
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
    orderId: string,
    contactId: string,
  ): Promise<{ ok: true }> {
    return this.associate(userId, orderId, 'contacts', contactId);
  }

  async disassociateContact(
    userId: string,
    orderId: string,
    contactId: string,
  ): Promise<{ ok: true }> {
    return this.disassociate(userId, orderId, 'contacts', contactId);
  }

  async associateCompany(
    userId: string,
    orderId: string,
    companyId: string,
  ): Promise<{ ok: true }> {
    return this.associate(userId, orderId, 'companies', companyId);
  }

  async disassociateCompany(
    userId: string,
    orderId: string,
    companyId: string,
  ): Promise<{ ok: true }> {
    return this.disassociate(userId, orderId, 'companies', companyId);
  }

  async associateDeal(
    userId: string,
    orderId: string,
    dealId: string,
  ): Promise<{ ok: true }> {
    return this.associate(userId, orderId, 'deals', dealId);
  }

  async disassociateDeal(
    userId: string,
    orderId: string,
    dealId: string,
  ): Promise<{ ok: true }> {
    return this.disassociate(userId, orderId, 'deals', dealId);
  }

  private async associate(
    userId: string,
    orderId: string,
    toObjectType: 'contacts' | 'companies' | 'deals',
    toObjectId: string,
  ): Promise<{ ok: true }> {
    const orderIdTrimmed = orderId?.trim();
    const toIdTrimmed = toObjectId?.trim();
    if (!orderIdTrimmed) {
      throw new BadRequestException('Order id is required.');
    }
    if (!toIdTrimmed) {
      throw new BadRequestException(`${labelFor(toObjectType)} id is required.`);
    }
    await this.api.request<void>(
      userId,
      'PUT',
      `/crm/v4/objects/orders/${encodeURIComponent(
        orderIdTrimmed,
      )}/associations/default/${toObjectType}/${encodeURIComponent(toIdTrimmed)}`,
    );
    return { ok: true };
  }

  private async disassociate(
    userId: string,
    orderId: string,
    toObjectType: 'contacts' | 'companies' | 'deals',
    toObjectId: string,
  ): Promise<{ ok: true }> {
    const orderIdTrimmed = orderId?.trim();
    const toIdTrimmed = toObjectId?.trim();
    if (!orderIdTrimmed) {
      throw new BadRequestException('Order id is required.');
    }
    if (!toIdTrimmed) {
      throw new BadRequestException(`${labelFor(toObjectType)} id is required.`);
    }
    await this.api.request<void>(
      userId,
      'DELETE',
      `/crm/v4/objects/orders/${encodeURIComponent(
        orderIdTrimmed,
      )}/associations/${toObjectType}/${encodeURIComponent(toIdTrimmed)}`,
    );
    return { ok: true };
  }

  // ── Pipeline defaults ────────────────────────────────────────────────────────

  private async resolveDefaultPipelineStage(
    userId: string,
  ): Promise<{ pipeline: string; stage: string } | null> {
    try {
      const data = await this.api.request<HubspotPipelinesResponse>(
        userId,
        'GET',
        '/crm/v3/pipelines/orders',
      );
      const pipeline = (data.results ?? [])[0];
      const stage = pipeline?.stages?.[0];
      if (pipeline?.id && stage?.id) {
        return { pipeline: pipeline.id, stage: stage.id };
      }
    } catch {
      // If pipelines can't be read, fall through and let HubSpot's own
      // validation surface a clear error on create.
    }
    return null;
  }

  // ── Mappers ────────────────────────────────────────────────────────────────

  private toHubspotProperties(
    input: HubspotOrderWriteInput,
  ): Record<string, string> {
    const props: Record<string, string> = {};
    if (input.name !== undefined) props.hs_order_name = input.name;
    if (input.pipeline !== undefined) props.hs_pipeline = input.pipeline;
    if (input.stage !== undefined) props.hs_pipeline_stage = input.stage;
    if (input.totalPrice !== undefined) {
      props.hs_total_price = String(input.totalPrice);
    }
    if (input.currency !== undefined) props.hs_currency_code = input.currency;
    if (input.status !== undefined) props.hs_fulfillment_status = input.status;
    if (input.sourceStore !== undefined) {
      props.hs_source_store = input.sourceStore;
    }
    if (input.ownerId !== undefined) props.hubspot_owner_id = input.ownerId;
    return props;
  }

  private toSummary(row: HubspotRawObject): HubspotOrderSummary {
    const props = row.properties ?? {};
    return {
      id: row.id,
      name: clean(props.hs_order_name) ?? 'Untitled order',
      totalPrice: toNumber(props.hs_total_price),
      currency: clean(props.hs_currency_code),
      status: clean(props.hs_fulfillment_status),
      pipeline: clean(props.hs_pipeline),
      stage: clean(props.hs_pipeline_stage),
      ownerId: clean(props.hubspot_owner_id),
      sourceStore: clean(props.hs_source_store),
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

function toNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function labelFor(type: 'contacts' | 'companies' | 'deals'): string {
  if (type === 'contacts') return 'Contact';
  if (type === 'companies') return 'Company';
  return 'Deal';
}
