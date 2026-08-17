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
  'hs_recurring_billing_period',
  'hs_pricing_model',
  'hs_tier_ranges',
  'hs_tier_prices',
] as const;

const PRODUCTS_PATH = '/crm/objects/2026-03/products';

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
  recurringBillingPeriod?: string;
  pricingModel?: 'volume' | 'graduated' | 'stairstep';
  tierRanges?: { start: number; end?: number }[];
  tierPrices?: { index: number; price: number; currency?: string }[];
};

@Injectable()
export class HubspotProductsService {
  constructor(private readonly api: HubspotApiClient) {}

  listProperties(userId: string): Promise<unknown> {
    return this.api.request(userId, 'GET', '/crm/properties/2026-03/products');
  }

  async list(
    userId: string,
    options: { limit?: number; after?: string } = {},
  ): Promise<HubspotPaginated<HubspotProductSummary>> {
    const data = await this.api.request<HubspotPagedResponse>(
      userId,
      'GET',
      PRODUCTS_PATH,
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
      `${PRODUCTS_PATH}/search`,
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
      `${PRODUCTS_PATH}/${encodeURIComponent(trimmed)}`,
      {
        query: { properties: PRODUCT_PROPERTIES.join(',') },
      },
    );
    return this.toSummary(data);
  }

  /**
   * Products cannot be associated directly. HubSpot's documented workflow is
   * to create a product-based line item and associate that line item to one
   * parent deal. The line item inherits catalog values from the product.
   */
  async createDealLineItem(
    userId: string,
    productId: string,
    input: { dealId: string; quantity?: number; name?: string },
  ): Promise<HubspotRawObject> {
    const product = await this.getById(userId, productId);
    const dealId = input.dealId?.trim();
    if (!dealId) throw new BadRequestException('Deal id is required.');

    return this.api.request<HubspotRawObject>(
      userId,
      'POST',
      '/crm/objects/2026-03/line_items',
      {
        body: {
          properties: {
            quantity: input.quantity ?? 1,
            hs_object_id: product.id,
            name: input.name?.trim() || product.name,
          },
          associations: [
            {
              to: { id: dealId },
              types: [
                {
                  associationCategory: 'HUBSPOT_DEFINED',
                  associationTypeId: 20,
                },
              ],
            },
          ],
        },
      },
    );
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
      PRODUCTS_PATH,
      { body: { properties } },
    );
    return data.id ? this.getById(userId, data.id) : this.toSummary(data);
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
      `${PRODUCTS_PATH}/${encodeURIComponent(trimmed)}`,
      { body: { properties } },
    );
    return this.getById(userId, data.id || trimmed);
  }

  async delete(userId: string, id: string): Promise<void> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw new BadRequestException('Product id is required.');
    }
    await this.api.request<void>(
      userId,
      'DELETE',
      `${PRODUCTS_PATH}/${encodeURIComponent(trimmed)}`,
    );
  }

  // ── Mappers ────────────────────────────────────────────────────────────────

  private toHubspotProperties(
    input: HubspotProductWriteInput,
  ): Record<string, string> {
    this.validateTieredPricing(input);
    const props: Record<string, string> = {};
    if (input.name !== undefined) props.name = input.name.trim();
    if (input.price !== undefined) props.price = String(input.price);
    if (input.sku !== undefined) props.hs_sku = input.sku;
    if (input.description !== undefined) props.description = input.description;
    if (input.cost !== undefined) {
      props.hs_cost_of_goods_sold = String(input.cost);
    }
    if (input.recurringBillingPeriod !== undefined) {
      props.hs_recurring_billing_period = input.recurringBillingPeriod;
    }
    if (input.pricingModel !== undefined) props.hs_pricing_model = input.pricingModel;
    if (input.tierRanges !== undefined) props.hs_tier_ranges = JSON.stringify(input.tierRanges);
    if (input.tierPrices !== undefined) {
      props.hs_tier_prices = JSON.stringify(
        input.tierPrices.map((tier) => ({
          ...tier,
          ...(tier.currency ? { currency: tier.currency.toUpperCase() } : {}),
        })),
      );
    }
    return props;
  }

  private validateTieredPricing(input: HubspotProductWriteInput): void {
    const hasTierFields =
      input.pricingModel !== undefined ||
      input.tierRanges !== undefined ||
      input.tierPrices !== undefined;
    if (!hasTierFields) return;
    if (input.price !== undefined) {
      throw new BadRequestException('Use tier prices instead of price for a tiered product.');
    }
    if (!input.pricingModel || !input.tierRanges?.length || !input.tierPrices?.length) {
      throw new BadRequestException(
        'Tiered pricing requires pricingModel, tierRanges, and tierPrices.',
      );
    }
    input.tierRanges.forEach((range, index) => {
      if (range.end !== undefined && range.end < range.start) {
        throw new BadRequestException(`Tier range ${index} ends before it starts.`);
      }
      if (index < input.tierRanges!.length - 1 && range.end === undefined) {
        throw new BadRequestException('Only the final tier range can be open-ended.');
      }
    });
    const currencies = new Set(input.tierPrices.map((tier) => tier.currency?.toUpperCase() ?? ''));
    for (const currency of currencies) {
      const indexes = new Set(
        input.tierPrices
          .filter((tier) => (tier.currency?.toUpperCase() ?? '') === currency)
          .map((tier) => tier.index),
      );
      if (input.tierRanges.some((_, index) => !indexes.has(index))) {
        throw new BadRequestException(
          `Tier prices${currency ? ` for ${currency}` : ''} must cover every range.`,
        );
      }
    }
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
      recurringBillingPeriod: clean(props.hs_recurring_billing_period),
      pricingModel: toPricingModel(props.hs_pricing_model),
      tierRanges: parseTierRanges(props.hs_tier_ranges),
      tierPrices: parseTierPrices(props.hs_tier_prices),
      archived: row.archived,
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

function toPricingModel(
  value: string | null | undefined,
): 'volume' | 'graduated' | 'stairstep' | undefined {
  return value === 'volume' || value === 'graduated' || value === 'stairstep'
    ? value
    : undefined;
}

function parseTierRanges(
  value: string | null | undefined,
): { start: number; end?: number }[] | undefined {
  const parsed = parseJsonArray(value);
  if (!parsed) return undefined;
  const ranges = parsed.filter(
    (item): item is { start: number; end?: number } =>
      isRecord(item) &&
      typeof item.start === 'number' &&
      (item.end === undefined || typeof item.end === 'number'),
  );
  return ranges.length === parsed.length ? ranges : undefined;
}

function parseTierPrices(
  value: string | null | undefined,
): { index: number; price: number; currency?: string }[] | undefined {
  const parsed = parseJsonArray(value);
  if (!parsed) return undefined;
  const prices = parsed.filter(
    (item): item is { index: number; price: number; currency?: string } =>
      isRecord(item) &&
      typeof item.index === 'number' &&
      typeof item.price === 'number' &&
      (item.currency === undefined || typeof item.currency === 'string'),
  );
  return prices.length === parsed.length ? prices : undefined;
}

function parseJsonArray(value: string | null | undefined): unknown[] | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
