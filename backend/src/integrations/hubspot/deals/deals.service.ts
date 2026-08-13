import { BadRequestException, Injectable } from '@nestjs/common';

import { HubspotApiClient } from '../hubspot-api.client';
import {
  HubspotDealSummary,
  HubspotPagedResponse,
  HubspotPaginated,
  HubspotRawObject,
} from '../hubspot.types';

const DEAL_PROPERTIES = [
  'dealname',
  'amount',
  'pipeline',
  'dealstage',
  'closedate',
  'hubspot_owner_id',
] as const;

@Injectable()
export class HubspotDealsService {
  constructor(private readonly api: HubspotApiClient) {}

  async list(
    userId: string,
    options: { limit?: number; after?: string } = {},
  ): Promise<HubspotPaginated<HubspotDealSummary>> {
    const data = await this.api.request<HubspotPagedResponse>(
      userId,
      'GET',
      '/crm/v3/objects/deals',
      {
        query: {
          limit: options.limit ?? 25,
          after: options.after,
          properties: DEAL_PROPERTIES.join(','),
        },
      },
    );

    return {
      results: (data.results ?? []).map((row) => this.toSummary(row)),
      after: data.paging?.next?.after ?? null,
    };
  }

  async getById(userId: string, id: string): Promise<HubspotDealSummary> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw new BadRequestException('Deal id is required.');
    }
    const data = await this.api.request<HubspotRawObject>(
      userId,
      'GET',
      `/crm/v3/objects/deals/${encodeURIComponent(trimmed)}`,
      {
        query: { properties: DEAL_PROPERTIES.join(',') },
      },
    );
    return this.toSummary(data);
  }

  private toSummary(row: HubspotRawObject): HubspotDealSummary {
    const props = row.properties ?? {};
    const amountRaw = props.amount;
    const amount =
      amountRaw !== undefined && amountRaw !== null && amountRaw !== ''
        ? Number(amountRaw)
        : null;

    return {
      id: row.id,
      name: clean(props.dealname) ?? 'Untitled deal',
      amount: Number.isFinite(amount as number) ? (amount as number) : null,
      pipeline: clean(props.pipeline),
      stage: clean(props.dealstage),
      closeDate: clean(props.closedate),
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
