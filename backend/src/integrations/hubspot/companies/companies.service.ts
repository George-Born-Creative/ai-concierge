import { BadRequestException, Injectable } from '@nestjs/common';

import { HubspotApiClient } from '../hubspot-api.client';
import { HubspotAssociationsService } from '../hubspot-associations.service';
import {
  HubspotCompanySummary,
  HubspotPagedResponse,
  HubspotPaginated,
  HubspotRawObject,
  HubspotSearchResponse,
} from '../hubspot.types';

const COMPANY_PATH = '/crm/objects/2026-03/companies';
const COMPANY_SEARCH_PATH = '/crm/v3/objects/companies/search';
const COMPANY_PROPERTIES = [
  'name', 'domain', 'hs_additional_domains', 'phone', 'industry', 'city', 'state',
  'country', 'numberofemployees', 'description', 'website', 'lifecyclestage',
  'hubspot_owner_id', 'hs_pinned_engagement_id', 'hs_lastactivitydate',
] as const;

export type HubspotCompanyIdProperty = 'id' | string;
export type HubspotCompanyCreateAssociation = {
  to: { id: string };
  types: {
    associationCategory: 'HUBSPOT_DEFINED' | 'USER_DEFINED' | 'INTEGRATOR_DEFINED';
    associationTypeId: number;
  }[];
};
export type HubspotCompanyWriteInput = {
  name?: string;
  domain?: string;
  additionalDomains?: string[];
  phone?: string;
  industry?: string;
  city?: string;
  state?: string;
  country?: string;
  numberOfEmployees?: number | null;
  description?: string;
  website?: string;
  lifecycleStage?: string;
  ownerId?: string;
  pinnedEngagementId?: string;
  associations?: HubspotCompanyCreateAssociation[];
};
export type HubspotCompanyDetail = HubspotCompanySummary & {
  properties: Record<string, string | null | undefined>;
  propertiesWithHistory?: Record<string, unknown>;
  associations?: Record<string, unknown>;
};
export type HubspotCompanyBatchResponse = {
  status?: string;
  requestedAt?: string;
  startedAt?: string;
  completedAt?: string;
  results: HubspotCompanySummary[];
  errors?: unknown[];
  links?: Record<string, string>;
};
type RawBatchResponse = Omit<HubspotCompanyBatchResponse, 'results'> & {
  results?: HubspotRawObject[];
};

@Injectable()
export class HubspotCompaniesService {
  constructor(
    private readonly api: HubspotApiClient,
    private readonly associations: HubspotAssociationsService,
  ) {}

  async list(
    userId: string,
    options: { limit?: number; after?: string } = {},
  ): Promise<HubspotPaginated<HubspotCompanySummary>> {
    const data = await this.api.request<HubspotPagedResponse>(userId, 'GET', COMPANY_PATH, {
      query: {
        limit: options.limit ?? 25,
        after: options.after,
        properties: COMPANY_PROPERTIES.join(','),
      },
    });
    return this.toPage(data);
  }

  async listRecent(
    userId: string,
    options: { limit?: number; after?: string } = {},
  ): Promise<HubspotPaginated<HubspotCompanySummary>> {
    return this.searchRequest(userId, {
      limit: options.limit ?? 25,
      after: options.after,
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
    });
  }

  async search(
    userId: string,
    options: { q: string; limit?: number; after?: string },
  ): Promise<HubspotPaginated<HubspotCompanySummary>> {
    const query = options.q?.trim();
    if (!query) throw new BadRequestException('Search query cannot be empty.');
    return this.searchRequest(userId, {
      query,
      limit: options.limit ?? 25,
      after: options.after,
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
    });
  }

  async getById(
    userId: string,
    id: string,
    idProperty: HubspotCompanyIdProperty = 'id',
  ): Promise<HubspotCompanySummary> {
    return this.toSummary(await this.getRaw(userId, id, idProperty));
  }

  async getDetail(
    userId: string,
    id: string,
    options: {
      idProperty?: HubspotCompanyIdProperty;
      properties?: string[];
      propertiesWithHistory?: string[];
      associations?: string[];
    } = {},
  ): Promise<HubspotCompanyDetail> {
    const row = await this.api.request<HubspotRawObject>(
      userId,
      'GET',
      `${COMPANY_PATH}/${encodeURIComponent(this.requireId(id))}`,
      {
        query: {
          idProperty: options.idProperty === 'id' ? undefined : options.idProperty,
          properties: unique([...COMPANY_PROPERTIES, ...(options.properties ?? [])]).join(','),
          propertiesWithHistory: options.propertiesWithHistory?.join(','),
          associations: options.associations?.join(','),
        },
      },
    );
    return {
      ...this.toSummary(row),
      properties: row.properties ?? {},
      propertiesWithHistory: row.propertiesWithHistory,
      associations: row.associations,
    };
  }

  async create(userId: string, input: HubspotCompanyWriteInput): Promise<HubspotCompanySummary> {
    const properties = this.toProperties(input, false);
    if (!properties.name && !properties.domain) {
      throw new BadRequestException('A company name or domain is required.');
    }
    const data = await this.api.request<HubspotRawObject>(userId, 'POST', COMPANY_PATH, {
      body: {
        properties,
        ...(input.associations?.length ? { associations: input.associations } : {}),
      },
    });
    return this.toSummary(data);
  }

  async update(
    userId: string,
    id: string,
    input: HubspotCompanyWriteInput,
    idProperty: HubspotCompanyIdProperty = 'id',
  ): Promise<HubspotCompanySummary> {
    const properties = this.toProperties(input, true);
    if (Object.keys(properties).length === 0) {
      throw new BadRequestException('At least one property is required.');
    }
    const data = await this.api.request<HubspotRawObject>(
      userId,
      'PATCH',
      `${COMPANY_PATH}/${encodeURIComponent(this.requireId(id))}`,
      {
        query: { idProperty: idProperty === 'id' ? undefined : idProperty },
        body: { properties },
      },
    );
    if (!data.id) {
      throw new BadRequestException('HubSpot update response did not include a company id.');
    }
    return this.getById(userId, data.id);
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.api.request<void>(
      userId,
      'DELETE',
      `${COMPANY_PATH}/${encodeURIComponent(this.requireId(id))}`,
    );
  }

  associate(userId: string, companyId: string, toType: string, toId: string) {
    return this.associations.associate(userId, 'companies', companyId, toType, toId);
  }

  disassociate(userId: string, companyId: string, toType: string, toId: string) {
    return this.associations.disassociate(userId, 'companies', companyId, toType, toId);
  }

  associateContact(userId: string, companyId: string, contactId: string) {
    return this.associate(userId, companyId, 'contacts', contactId);
  }

  disassociateContact(userId: string, companyId: string, contactId: string) {
    return this.disassociate(userId, companyId, 'contacts', contactId);
  }

  associateDeal(userId: string, companyId: string, dealId: string) {
    return this.associate(userId, companyId, 'deals', dealId);
  }

  disassociateDeal(userId: string, companyId: string, dealId: string) {
    return this.disassociate(userId, companyId, 'deals', dealId);
  }

  async batchRead(
    userId: string,
    input: {
      ids: string[];
      idProperty?: string;
      properties?: string[];
      propertiesWithHistory?: string[];
    },
  ): Promise<HubspotCompanyBatchResponse> {
    this.requireBatch(input.ids);
    const data = await this.api.request<RawBatchResponse>(
      userId,
      'POST',
      `${COMPANY_PATH}/batch/read`,
      {
        body: {
          inputs: input.ids.map((id) => ({ id: id.trim() })),
          properties: input.properties?.length ? input.properties : [...COMPANY_PROPERTIES],
          ...(input.propertiesWithHistory?.length
            ? { propertiesWithHistory: input.propertiesWithHistory }
            : {}),
          ...(input.idProperty ? { idProperty: input.idProperty } : {}),
        },
      },
    );
    return this.toBatch(data);
  }

  async batchUpdate(
    userId: string,
    inputs: { id: string; idProperty?: string; properties: HubspotCompanyWriteInput }[],
  ): Promise<HubspotCompanyBatchResponse> {
    this.requireBatch(inputs.map((input) => input.id));
    const normalized = inputs.map((input) => ({
      id: input.id.trim(),
      ...(input.idProperty ? { idProperty: input.idProperty } : {}),
      properties: this.toProperties(input.properties, true),
    }));
    if (normalized.some((input) => Object.keys(input.properties).length === 0)) {
      throw new BadRequestException('Every batch update must include at least one property.');
    }
    const data = await this.api.request<RawBatchResponse>(
      userId,
      'POST',
      `${COMPANY_PATH}/batch/update`,
      { body: { inputs: normalized } },
    );
    return this.toBatch(data);
  }

  async batchArchive(userId: string, ids: string[]): Promise<void> {
    this.requireBatch(ids);
    await this.api.request<void>(userId, 'POST', `${COMPANY_PATH}/batch/archive`, {
      body: { inputs: ids.map((id) => ({ id: id.trim() })) },
    });
  }

  private async searchRequest(userId: string, body: Record<string, unknown>) {
    const data = await this.api.request<HubspotSearchResponse>(
      userId,
      'POST',
      COMPANY_SEARCH_PATH,
      { body: { ...body, properties: COMPANY_PROPERTIES } },
    );
    return this.toPage(data);
  }

  private getRaw(userId: string, id: string, idProperty: HubspotCompanyIdProperty) {
    return this.api.request<HubspotRawObject>(
      userId,
      'GET',
      `${COMPANY_PATH}/${encodeURIComponent(this.requireId(id))}`,
      {
        query: {
          idProperty: idProperty === 'id' ? undefined : idProperty,
          properties: COMPANY_PROPERTIES.join(','),
        },
      },
    );
  }

  private toProperties(input: HubspotCompanyWriteInput, preserveEmpty: boolean) {
    const properties: Record<string, string> = {};
    const assign = (key: string, value: string | undefined) => {
      if (value === undefined) return;
      const normalized = value.trim();
      if (preserveEmpty || normalized) properties[key] = normalized;
    };
    assign('name', input.name);
    assign('domain', input.domain);
    if (input.additionalDomains !== undefined) {
      properties.hs_additional_domains = input.additionalDomains
        .map((domain) => domain.trim()).filter(Boolean).join(';');
    }
    assign('phone', input.phone);
    assign('industry', input.industry);
    assign('city', input.city);
    assign('state', input.state);
    assign('country', input.country);
    if (input.numberOfEmployees !== undefined) {
      properties.numberofemployees = input.numberOfEmployees === null
        ? ''
        : String(input.numberOfEmployees);
    }
    assign('description', input.description);
    assign('website', input.website);
    assign('lifecyclestage', input.lifecycleStage);
    assign('hubspot_owner_id', input.ownerId);
    assign('hs_pinned_engagement_id', input.pinnedEngagementId);
    return properties;
  }

  private toPage(
    data: HubspotPagedResponse | HubspotSearchResponse,
  ): HubspotPaginated<HubspotCompanySummary> {
    return {
      results: (data.results ?? []).map((row) => this.toSummary(row)),
      total: 'total' in data ? data.total : undefined,
      after: data.paging?.next?.after ?? null,
    };
  }

  private toBatch(data: RawBatchResponse): HubspotCompanyBatchResponse {
    return { ...data, results: (data.results ?? []).map((row) => this.toSummary(row)) };
  }

  private toSummary(row: HubspotRawObject): HubspotCompanySummary {
    const props = row.properties ?? {};
    return {
      id: row.id,
      name: clean(props.name) ?? clean(props.domain) ?? 'Unnamed company',
      domain: clean(props.domain),
      additionalDomains: splitDomains(props.hs_additional_domains),
      phone: clean(props.phone),
      industry: clean(props.industry),
      city: clean(props.city),
      state: clean(props.state),
      country: clean(props.country),
      numberOfEmployees: toNumber(props.numberofemployees),
      description: clean(props.description),
      website: clean(props.website),
      lifecycleStage: clean(props.lifecyclestage),
      ownerId: clean(props.hubspot_owner_id),
      pinnedEngagementId: clean(props.hs_pinned_engagement_id),
      lastActivityAt: clean(props.hs_lastactivitydate),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private requireId(id: string): string {
    const trimmed = id?.trim();
    if (!trimmed) throw new BadRequestException('Company id is required.');
    return trimmed;
  }

  private requireBatch(ids: string[]) {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) {
      throw new BadRequestException('Company batch operations require between 1 and 100 records.');
    }
    if (ids.some((id) => !id?.trim())) {
      throw new BadRequestException('Every company batch input requires an id.');
    }
  }
}

function clean(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = String(value).trim();
  return trimmed || undefined;
}

function toNumber(value: string | null | undefined): number | undefined {
  const normalized = clean(value);
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function splitDomains(value: string | null | undefined): string[] | undefined {
  const domains = value?.split(';').map((domain) => domain.trim()).filter(Boolean) ?? [];
  return domains.length ? domains : undefined;
}

function unique(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
