import { BadRequestException, Injectable } from '@nestjs/common';

import { HubspotApiClient } from '../hubspot-api.client';
import {
  HubspotContactSummary,
  HubspotPagedResponse,
  HubspotPaginated,
  HubspotRawObject,
  HubspotSearchResponse,
} from '../hubspot.types';

const CONTACT_PROPERTIES = [
  'firstname',
  'lastname',
  'email',
  'phone',
  'company',
  'lifecyclestage',
] as const;

export type HubspotContactWriteInput = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  lifecycleStage?: string;
};

@Injectable()
export class HubspotContactsService {
  constructor(private readonly api: HubspotApiClient) {}

  async list(
    userId: string,
    options: { limit?: number; after?: string } = {},
  ): Promise<HubspotPaginated<HubspotContactSummary>> {
    const limit = options.limit ?? 25;

    const data = await this.api.request<HubspotPagedResponse>(
      userId,
      'GET',
      '/crm/v3/objects/contacts',
      {
        query: {
          limit,
          after: options.after,
          properties: CONTACT_PROPERTIES.join(','),
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
  ): Promise<HubspotPaginated<HubspotContactSummary>> {
    const query = options.q.trim();
    if (!query) {
      throw new BadRequestException('Search query cannot be empty.');
    }

    const data = await this.api.request<HubspotSearchResponse>(
      userId,
      'POST',
      '/crm/v3/objects/contacts/search',
      {
        body: {
          query,
          limit: options.limit ?? 25,
          after: options.after,
          properties: CONTACT_PROPERTIES,
          sorts: [
            { propertyName: 'lastmodifieddate', direction: 'DESCENDING' },
          ],
        },
      },
    );

    return {
      results: (data.results ?? []).map((row) => this.toSummary(row)),
      after: data.paging?.next?.after ?? null,
    };
  }

  async getById(userId: string, id: string): Promise<HubspotContactSummary> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw new BadRequestException('Contact id is required.');
    }
    const data = await this.api.request<HubspotRawObject>(
      userId,
      'GET',
      `/crm/v3/objects/contacts/${encodeURIComponent(trimmed)}`,
      {
        query: { properties: CONTACT_PROPERTIES.join(',') },
      },
    );
    return this.toSummary(data);
  }

  // ── Writes ─────────────────────────────────────────────────────────────────
  //
  // HubSpot stores all CRM data as `properties` on the object. We accept the
  // same camelCase shape the GHL service uses (`firstName`, `lastName`,
  // `email`, `phone`) and translate to HubSpot's lowercase property names
  // (`firstname`, `lastname`, …) right at the boundary so the rest of the
  // assistant code never has to care about which CRM is talking.

  async create(
    userId: string,
    input: HubspotContactWriteInput,
  ): Promise<HubspotContactSummary> {
    const properties = this.toHubspotProperties(input);
    if (Object.keys(properties).length === 0) {
      throw new BadRequestException('At least one property is required.');
    }
    const data = await this.api.request<HubspotRawObject>(
      userId,
      'POST',
      '/crm/v3/objects/contacts',
      { body: { properties } },
    );
    return this.toSummary(data);
  }

  async update(
    userId: string,
    id: string,
    input: HubspotContactWriteInput,
  ): Promise<HubspotContactSummary> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw new BadRequestException('Contact id is required.');
    }
    const properties = this.toHubspotProperties(input);
    if (Object.keys(properties).length === 0) {
      throw new BadRequestException('At least one property is required.');
    }
    const data = await this.api.request<HubspotRawObject>(
      userId,
      'PATCH',
      `/crm/v3/objects/contacts/${encodeURIComponent(trimmed)}`,
      {
        query: { properties: CONTACT_PROPERTIES.join(',') },
        body: { properties },
      },
    );
    return this.toSummary(data);
  }

  async delete(userId: string, id: string): Promise<void> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw new BadRequestException('Contact id is required.');
    }
    await this.api.request<void>(
      userId,
      'DELETE',
      `/crm/v3/objects/contacts/${encodeURIComponent(trimmed)}`,
    );
  }

  private toHubspotProperties(
    input: HubspotContactWriteInput,
  ): Record<string, string> {
    const props: Record<string, string> = {};
    if (input.firstName !== undefined) props.firstname = input.firstName;
    if (input.lastName !== undefined) props.lastname = input.lastName;
    if (input.email !== undefined) props.email = input.email;
    if (input.phone !== undefined) props.phone = input.phone;
    if (input.company !== undefined) props.company = input.company;
    if (input.lifecycleStage !== undefined)
      props.lifecyclestage = input.lifecycleStage;
    return props;
  }

  private toSummary(row: HubspotRawObject): HubspotContactSummary {
    const props = row.properties ?? {};
    const firstName = clean(props.firstname);
    const lastName = clean(props.lastname);
    const email = clean(props.email);
    const display =
      [firstName, lastName].filter(Boolean).join(' ').trim() ||
      email ||
      'Unnamed contact';

    return {
      id: row.id,
      firstName,
      lastName,
      name: display,
      email,
      phone: clean(props.phone),
      company: clean(props.company),
      lifecycleStage: clean(props.lifecyclestage),
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
