import { BadRequestException, Injectable } from '@nestjs/common';

import { HubspotApiClient } from '../hubspot-api.client';
import {
  HubspotPagedResponse,
  HubspotPaginated,
  HubspotProductSummary,
  HubspotRawObject,
  HubspotSearchResponse,
} from '../hubspot.types';

/**
 * Property allow-list requested from HubSpot on every product read. HubSpot
 * otherwise returns a tiny default set, so anything surfaced in
 * `HubspotProductSummary` must be listed here. Names are HubSpot's lowercase
 * property keys, not the camelCase shape we expose to clients.
 */
const PRODUCT_PROPERTIES = [
  'name',
  'price',
  'hs_sku',
  'description',
  'hs_cost_of_goods_sold',
] as const;

/**
 * Shape accepted from controllers for create / update. CamelCase so the REST
 * surface matches the other HubSpot resources and the mobile app uses one
 * shared form. The service translates to HubSpot's lowercase property names in
 * `toHubspotProperties`.
 *
 * NOTE: HubSpot products are a *library* object. Unlike tickets they don't
 * associate with contacts/companies/deals — putting a product on a deal is done
 * via line items — so this service is CRUD + search only.
 */
export type HubspotProductWriteInput = {
  name?: string;
  price?: number;
  sku?: string;
  description?: string;
  cost?: number;
};

@Injectable()
export class HubspotProductsService {
  constructor(private readonly api: HubspotApiClient) {}

  async list(
    userId: string,
    options: { limit?: number; after?: string } = {},
  ): Promise<HubspotPaginated<HubspotProductSummary>> {
    const data = await this.api.request<HubspotPagedResponse>(
      userId,
      'GET',
      '/crm/v3/objects/products',
      {
        query: {
          limit: options.limit ?? 25,
          after: options.after,
          properties: PRODUCT_PROPERTIES.join(','),
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
  ): Promise<HubspotPaginated<HubspotProductSummary>> {
    const query = options.q.trim();
    if (!query) {
      throw new BadRequestException('Search query cannot be empty.');
    }

    const data = await this.api.request<HubspotSearchResponse>(
      userId,
      'POST',
      '/crm/v3/objects/products/search',
      {
        body: {
          query,
          limit: options.limit ?? 25,
          after: options.after,
          properties: PRODUCT_PROPERTIES,
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

  async getById(userId: string, id: string): Promise<HubspotProductSummary> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw new BadRequestException('Product id is required.');
    }
    const data = await this.api.request<HubspotRawObject>(
      userId,
      'GET',
      `/crm/v3/objects/products/${encodeURIComponent(trimmed)}`,
      {
        query: { properties: PRODUCT_PROPERTIES.join(',') },
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
    input: HubspotProductWriteInput,
  ): Promise<HubspotProductSummary> {
    const properties = this.toHubspotProperties(input);
    // HubSpot requires a name on product create.
    if (!properties.name) {
      throw new BadRequestException('A product name is required.');
    }

    const data = await this.api.request<HubspotRawObject>(
      userId,
      'POST',
      '/crm/v3/objects/products',
      { body: { properties } },
    );
    return this.toSummary(data);
  }

  async update(
    userId: string,
    id: string,
    input: HubspotProductWriteInput,
  ): Promise<HubspotProductSummary> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw new BadRequestException('Product id is required.');
    }
    const properties = this.toHubspotProperties(input);
    if (Object.keys(properties).length === 0) {
      throw new BadRequestException('At least one property is required.');
    }
    const data = await this.api.request<HubspotRawObject>(
      userId,
      'PATCH',
      `/crm/v3/objects/products/${encodeURIComponent(trimmed)}`,
      {
        query: { properties: PRODUCT_PROPERTIES.join(',') },
        body: { properties },
      },
    );
    return this.toSummary(data);
  }

  async delete(userId: string, id: string): Promise<void> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw new BadRequestException('Product id is required.');
    }
    await this.api.request<void>(
      userId,
      'DELETE',
      `/crm/v3/objects/products/${encodeURIComponent(trimmed)}`,
    );
  }

  // ── Mappers ────────────────────────────────────────────────────────────────

  private toHubspotProperties(
    input: HubspotProductWriteInput,
  ): Record<string, string> {
    const props: Record<string, string> = {};
    if (input.name !== undefined) props.name = input.name;
    if (input.price !== undefined) props.price = String(input.price);
    if (input.sku !== undefined) props.hs_sku = input.sku;
    if (input.description !== undefined) props.description = input.description;
    if (input.cost !== undefined) {
      props.hs_cost_of_goods_sold = String(input.cost);
    }
    return props;
  }

  private toSummary(row: HubspotRawObject): HubspotProductSummary {
    const props = row.properties ?? {};
    return {
      id: row.id,
      name: clean(props.name) ?? 'Untitled product',
      price: toNumber(props.price),
      sku: clean(props.hs_sku),
      description: clean(props.description),
      cost: toNumber(props.hs_cost_of_goods_sold),
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
