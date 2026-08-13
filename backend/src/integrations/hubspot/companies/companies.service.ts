import { BadRequestException, Injectable } from '@nestjs/common';

import { HubspotApiClient } from '../hubspot-api.client';
import {
  HubspotCompanySummary,
  HubspotPagedResponse,
  HubspotPaginated,
  HubspotRawObject,
  HubspotSearchResponse,
} from '../hubspot.types';

/**
 * Property allow-list the service requests from HubSpot on every read.
 * HubSpot otherwise returns a tiny default set (just `name` / `domain`),
 * so anything we want to surface in `HubspotCompanySummary` must be
 * listed here. Names are HubSpot's lowercase property keys, not the
 * camelCase shape we expose to clients.
 */
const COMPANY_PROPERTIES = [
  'name',
  'domain',
  'phone',
  'industry',
  'city',
  'state',
  'country',
  'numberofemployees',
  'description',
  'website',
] as const;

/**
 * Shape we accept from controllers for create / update. CamelCase so the
 * REST surface matches the contacts DTO and the mobile app uses one
 * shared form across CRMs. Service translates to HubSpot's lowercase
 * property names in `toHubspotProperties`.
 */
export type HubspotCompanyWriteInput = {
  name?: string;
  domain?: string;
  phone?: string;
  industry?: string;
  city?: string;
  state?: string;
  country?: string;
  numberOfEmployees?: number;
  description?: string;
  website?: string;
};

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

  async search(
    userId: string,
    options: { q: string; limit?: number; after?: string },
  ): Promise<HubspotPaginated<HubspotCompanySummary>> {
    const query = options.q.trim();
    if (!query) {
      throw new BadRequestException('Search query cannot be empty.');
    }

    const data = await this.api.request<HubspotSearchResponse>(
      userId,
      'POST',
      '/crm/v3/objects/companies/search',
      {
        body: {
          query,
          limit: options.limit ?? 25,
          after: options.after,
          properties: COMPANY_PROPERTIES,
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

  // ── Writes ─────────────────────────────────────────────────────────────────
  //
  // HubSpot stores all CRM data as `properties` on the object. We accept the
  // same camelCase shape the contacts service uses and translate to HubSpot's
  // lowercase property names at the API boundary so the rest of the codebase
  // never has to care about which CRM is talking.

  async create(
    userId: string,
    input: HubspotCompanyWriteInput,
  ): Promise<HubspotCompanySummary> {
    const properties = this.toHubspotProperties(input);
    if (Object.keys(properties).length === 0) {
      throw new BadRequestException('At least one property is required.');
    }
    const data = await this.api.request<HubspotRawObject>(
      userId,
      'POST',
      '/crm/v3/objects/companies',
      { body: { properties } },
    );
    return this.toSummary(data);
  }

  async update(
    userId: string,
    id: string,
    input: HubspotCompanyWriteInput,
  ): Promise<HubspotCompanySummary> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw new BadRequestException('Company id is required.');
    }
    const properties = this.toHubspotProperties(input);
    if (Object.keys(properties).length === 0) {
      throw new BadRequestException('At least one property is required.');
    }
    const data = await this.api.request<HubspotRawObject>(
      userId,
      'PATCH',
      `/crm/v3/objects/companies/${encodeURIComponent(trimmed)}`,
      {
        query: { properties: COMPANY_PROPERTIES.join(',') },
        body: { properties },
      },
    );
    return this.toSummary(data);
  }

  async delete(userId: string, id: string): Promise<void> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw new BadRequestException('Company id is required.');
    }
    await this.api.request<void>(
      userId,
      'DELETE',
      `/crm/v3/objects/companies/${encodeURIComponent(trimmed)}`,
    );
  }

  // ── Associations (v4) ──────────────────────────────────────────────────────
  //
  // HubSpot's v4 associations API. The `/default/` path lets HubSpot pick the
  // standard association label for the pair (e.g. `company_to_contact`) so we
  // don't have to hard-code numeric association-type ids that vary per portal.
  //
  // Delete is a single endpoint (no `/default/`) that drops every association
  // between the two objects regardless of label — idempotent if none exist.

  async associateContact(
    userId: string,
    companyId: string,
    contactId: string,
  ): Promise<{ ok: true }> {
    return this.associate(userId, companyId, 'contacts', contactId);
  }

  async disassociateContact(
    userId: string,
    companyId: string,
    contactId: string,
  ): Promise<{ ok: true }> {
    return this.disassociate(userId, companyId, 'contacts', contactId);
  }

  async associateDeal(
    userId: string,
    companyId: string,
    dealId: string,
  ): Promise<{ ok: true }> {
    return this.associate(userId, companyId, 'deals', dealId);
  }

  async disassociateDeal(
    userId: string,
    companyId: string,
    dealId: string,
  ): Promise<{ ok: true }> {
    return this.disassociate(userId, companyId, 'deals', dealId);
  }

  private async associate(
    userId: string,
    companyId: string,
    toObjectType: 'contacts' | 'deals',
    toObjectId: string,
  ): Promise<{ ok: true }> {
    const companyIdTrimmed = companyId?.trim();
    const toIdTrimmed = toObjectId?.trim();
    if (!companyIdTrimmed) {
      throw new BadRequestException('Company id is required.');
    }
    if (!toIdTrimmed) {
      throw new BadRequestException(
        `${toObjectType === 'contacts' ? 'Contact' : 'Deal'} id is required.`,
      );
    }
    await this.api.request<void>(
      userId,
      'PUT',
      `/crm/v4/objects/companies/${encodeURIComponent(
        companyIdTrimmed,
      )}/associations/default/${toObjectType}/${encodeURIComponent(toIdTrimmed)}`,
    );
    return { ok: true };
  }

  private async disassociate(
    userId: string,
    companyId: string,
    toObjectType: 'contacts' | 'deals',
    toObjectId: string,
  ): Promise<{ ok: true }> {
    const companyIdTrimmed = companyId?.trim();
    const toIdTrimmed = toObjectId?.trim();
    if (!companyIdTrimmed) {
      throw new BadRequestException('Company id is required.');
    }
    if (!toIdTrimmed) {
      throw new BadRequestException(
        `${toObjectType === 'contacts' ? 'Contact' : 'Deal'} id is required.`,
      );
    }
    await this.api.request<void>(
      userId,
      'DELETE',
      `/crm/v4/objects/companies/${encodeURIComponent(
        companyIdTrimmed,
      )}/associations/${toObjectType}/${encodeURIComponent(toIdTrimmed)}`,
    );
    return { ok: true };
  }

  // ── Mappers ────────────────────────────────────────────────────────────────

  private toHubspotProperties(
    input: HubspotCompanyWriteInput,
  ): Record<string, string> {
    const props: Record<string, string> = {};
    if (input.name !== undefined) props.name = input.name;
    if (input.domain !== undefined) props.domain = input.domain;
    if (input.phone !== undefined) props.phone = input.phone;
    if (input.industry !== undefined) props.industry = input.industry;
    if (input.city !== undefined) props.city = input.city;
    if (input.state !== undefined) props.state = input.state;
    if (input.country !== undefined) props.country = input.country;
    if (input.numberOfEmployees !== undefined) {
      // HubSpot expects all properties as strings on write, even numeric ones.
      props.numberofemployees = String(input.numberOfEmployees);
    }
    if (input.description !== undefined) props.description = input.description;
    if (input.website !== undefined) props.website = input.website;
    return props;
  }

  private toSummary(row: HubspotRawObject): HubspotCompanySummary {
    const props = row.properties ?? {};
    const employees = parseEmployeeCount(props.numberofemployees);
    return {
      id: row.id,
      name: clean(props.name) ?? clean(props.domain) ?? 'Unnamed company',
      domain: clean(props.domain),
      phone: clean(props.phone),
      industry: clean(props.industry),
      city: clean(props.city),
      state: clean(props.state),
      country: clean(props.country),
      numberOfEmployees: employees,
      description: clean(props.description),
      website: clean(props.website),
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

function parseEmployeeCount(
  value: string | null | undefined,
): number | undefined {
  const trimmed = clean(value);
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}
