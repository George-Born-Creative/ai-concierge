import { BadRequestException, Injectable } from '@nestjs/common';

import { HubspotApiClient } from '../hubspot-api.client';
import {
  HubspotCompanySummary,
  HubspotPagedResponse,
  HubspotPaginated,
  HubspotRawObject,
} from '../hubspot.types';

const COMPANY_PROPERTIES = [
  'name',
  'domain',
  'industry',
  'city',
  'country',
] as const;

@Injectable()
export class HubspotCompaniesService {
  constructor(private readonly api: HubspotApiClient) {}

  async list(
    userId: string,
    options: { limit?: number; after?: string } = {},
  ): Promise<HubspotPaginated<HubspotCompanySummary>> {
    const data = await this.api.request<HubspotPagedResponse>(
      userId,
      'GET',
      '/crm/v3/objects/companies',
      {
        query: {
          limit: options.limit ?? 25,
          after: options.after,
          properties: COMPANY_PROPERTIES.join(','),
        },
      },
    );

    return {
      results: (data.results ?? []).map((row) => this.toSummary(row)),
      after: data.paging?.next?.after ?? null,
    };
  }

  async getById(userId: string, id: string): Promise<HubspotCompanySummary> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw new BadRequestException('Company id is required.');
    }
    const data = await this.api.request<HubspotRawObject>(
      userId,
      'GET',
      `/crm/v3/objects/companies/${encodeURIComponent(trimmed)}`,
      {
        query: { properties: COMPANY_PROPERTIES.join(',') },
      },
    );
    return this.toSummary(data);
  }

  private toSummary(row: HubspotRawObject): HubspotCompanySummary {
    const props = row.properties ?? {};
    return {
      id: row.id,
      name: clean(props.name) ?? clean(props.domain) ?? 'Unnamed company',
      domain: clean(props.domain),
      industry: clean(props.industry),
      city: clean(props.city),
      country: clean(props.country),
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
