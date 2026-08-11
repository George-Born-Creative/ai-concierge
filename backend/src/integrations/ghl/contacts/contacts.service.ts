import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { GhlApiService } from '../shared/ghl-api.service';
import type {
  GhlContactInput,
  GhlContactSearchInput,
  GhlContactsListResult,
  GhlContactSummary,
} from './contacts.type';

type GhlRawContact = {
  id?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  source?: string;
  assignedTo?: string;
  tags?: string[];
  dateAdded?: string;
  dateUpdated?: string;
};

type GhlSearchContactsResponse = {
  contacts?: GhlRawContact[];
  total?: number;
  count?: number;
  meta?: {
    total?: number;
    currentPage?: number;
    nextPage?: number | null;
    page?: number;
    pageLimit?: number;
    startAfterId?: string | null;
    nextPageUrl?: string | null;
  };
};

const STRING_FIELDS = [
  'firstName',
  'lastName',
  'name',
  'email',
  'phone',
  'companyName',
  'address1',
  'city',
  'state',
  'postalCode',
  'country',
  'website',
  'timezone',
  'source',
  'assignedTo',
] as const;

@Injectable()
export class ContactsService {
  constructor(private readonly api: GhlApiService) {}

  listContacts(
    userId: string,
    limit = 10,
    query?: string,
    page = 1,
  ): Promise<GhlContactsListResult> {
    return this.searchContacts(userId, { limit, query, page });
  }

  async listAllContacts(userId: string, query?: string): Promise<GhlContactsListResult> {
    const contacts: GhlContactSummary[] = [];
    const seenContactIds = new Set<string>();
    const seenPages = new Set<number>();
    const pageLimit = 100;
    let page = 1;
    let total: number | undefined;

    while (!seenPages.has(page)) {
      if (seenPages.size >= 1000) {
        throw new BadRequestException('Too many GHL contact pages to return safely');
      }
      seenPages.add(page);

      const result = await this.searchContacts(userId, { limit: pageLimit, page, query });
      total = result.meta?.total ?? total;
      for (const contact of result.contacts) {
        if (seenContactIds.has(contact.id)) continue;
        seenContactIds.add(contact.id);
        contacts.push(contact);
      }

      if (total !== undefined && contacts.length >= total) break;
      const nextPage = result.meta?.nextPage;
      if (nextPage !== undefined && nextPage !== null && nextPage > page) {
        page = nextPage;
        continue;
      }
      if (result.contacts.length < pageLimit) break;
      page += 1;
    }

    return {
      contacts,
      meta: {
        total: total ?? contacts.length,
        currentPage: page,
        nextPage: null,
        pageLimit,
        startAfterId: null,
        nextPageUrl: null,
      },
    };
  }
  async searchContacts(
    userId: string,
    input: GhlContactSearchInput,
  ): Promise<GhlContactsListResult> {
    const locationId = await this.requireLocationId(userId);
    const pageLimit = Math.min(Math.max(input.limit ?? 10, 1), 100);
    const page = Math.max(input.page ?? 1, 1);
    const body: Record<string, unknown> = { locationId, page, pageLimit };

    if (input.query?.trim()) body.query = input.query.trim();
    if (input.filters?.length) body.filters = input.filters;
    if (input.sort?.length) body.sort = input.sort;

    const raw = await this.api.ghlRequest<GhlSearchContactsResponse>(
      userId,
      'POST',
      '/contacts/search',
      body,
    );
    const meta = raw.meta;
    const total = meta?.total ?? raw.total ?? raw.count;
    const nextPage =
      meta?.nextPage ??
      (total !== undefined && page * pageLimit < total ? page + 1 : null);

    return {
      contacts: (raw.contacts ?? []).map((contact) => this.toContactSummary(contact)),
      meta: {
        total,
        currentPage: meta?.currentPage ?? meta?.page ?? page,
        nextPage,
        pageLimit: meta?.pageLimit ?? pageLimit,
        startAfterId: meta?.startAfterId ?? null,
        nextPageUrl: meta?.nextPageUrl ?? null,
      },
    };
  }

  async getContact(userId: string, contactId: string): Promise<GhlContactSummary> {
    const id = this.requireContactId(contactId);
    const raw = await this.api.ghlRequest<{ contact?: GhlRawContact } & GhlRawContact>(
      userId,
      'GET',
      `/contacts/${encodeURIComponent(id)}`,
    );
    const contact = raw.contact ?? raw;
    if (!contact.id) throw new NotFoundException('GHL contact was not found');
    return this.toContactSummary(contact);
  }

  async createContact(userId: string, input: GhlContactInput): Promise<GhlContactSummary> {
    const locationId = await this.requireLocationId(userId);
    const body = this.normalizeInput(input, false);
    if (Object.keys(body).length === 0) {
      throw new BadRequestException('At least one contact field is required');
    }

    const raw = await this.api.ghlRequest<{ contact?: GhlRawContact }>(
      userId,
      'POST',
      '/contacts/',
      { locationId, ...body },
    );
    const contact = raw.contact;
    if (!contact?.id) throw new BadRequestException('GHL did not return the created contact');
    await this.api.audit(userId, 'ghl.contact.create', 'success', { contactId: contact.id });
    return this.toContactSummary(contact);
  }

  async upsertContact(userId: string, input: GhlContactInput): Promise<GhlContactSummary> {
    const locationId = await this.requireLocationId(userId);
    const body = this.normalizeInput(input, false);
    if (!body.email && !body.phone) {
      throw new BadRequestException('email or phone is required to upsert a contact');
    }

    const raw = await this.api.ghlRequest<{ contact?: GhlRawContact } & GhlRawContact>(
      userId,
      'POST',
      '/contacts/upsert',
      { locationId, ...body },
    );
    const contact = raw.contact ?? raw;
    if (!contact.id) throw new BadRequestException('GHL did not return the upserted contact');
    await this.api.audit(userId, 'ghl.contact.upsert', 'success', { contactId: contact.id });
    return this.toContactSummary(contact);
  }

  async updateContact(
    userId: string,
    contactId: string,
    input: GhlContactInput,
  ): Promise<GhlContactSummary> {
    const id = this.requireContactId(contactId);
    const body = this.normalizeInput(input, true);
    if (Object.keys(body).length === 0) {
      throw new BadRequestException('At least one field is required to update a contact');
    }

    const raw = await this.api.ghlRequest<{ contact?: GhlRawContact } & GhlRawContact>(
      userId,
      'PUT',
      `/contacts/${encodeURIComponent(id)}`,
      body,
    );
    const contact = raw.contact ?? raw;
    if (!contact.id) throw new BadRequestException('GHL did not return the updated contact');
    await this.api.audit(userId, 'ghl.contact.update', 'success', {
      contactId: id,
      fields: Object.keys(body),
    });
    return this.toContactSummary(contact);
  }

  async deleteContact(userId: string, contactId: string): Promise<{ ok: true }> {
    const id = this.requireContactId(contactId);
    await this.api.ghlRequest(userId, 'DELETE', `/contacts/${encodeURIComponent(id)}`);
    await this.api.audit(userId, 'ghl.contact.delete', 'success', { contactId: id });
    return { ok: true };
  }

  private async requireLocationId(userId: string): Promise<string> {
    const { locationId } = await this.api.getValidAccessToken(userId);
    if (!locationId) throw new BadRequestException('GHL location is missing - reconnect GoHighLevel');
    return locationId;
  }

  private requireContactId(contactId: string): string {
    const id = contactId?.trim();
    if (!id) throw new BadRequestException('contactId is required');
    return id;
  }

  private normalizeInput(input: GhlContactInput, preserveEmpty: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    for (const field of STRING_FIELDS) {
      const value = input[field];
      if (value === null) {
        if (preserveEmpty) body[field] = null;
        continue;
      }
      if (value === undefined) continue;
      const trimmed = value.trim();
      if (trimmed || preserveEmpty) body[field] = trimmed;
    }
    if (input.tags !== undefined) body.tags = input.tags;
    if (input.customFields !== undefined) body.customFields = input.customFields;
    return body;
  }

  private toContactSummary(contact: GhlRawContact): GhlContactSummary {
    if (!contact.id) throw new BadRequestException('GHL returned a contact without an id');
    return {
      id: contact.id,
      name:
        contact.name ||
        [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
        contact.email ||
        contact.phone ||
        'Unknown',
      firstName: contact.firstName,
      lastName: contact.lastName,
      phone: contact.phone,
      email: contact.email,
      companyName: contact.companyName,
      address1: contact.address1,
      city: contact.city,
      state: contact.state,
      postalCode: contact.postalCode,
      country: contact.country,
      source: contact.source,
      assignedTo: contact.assignedTo,
      tags: contact.tags,
      dateAdded: contact.dateAdded,
      dateUpdated: contact.dateUpdated,
    };
  }
}
