import { Injectable } from '@nestjs/common';

import { HubspotCompaniesService } from '../integrations/hubspot/companies/companies.service';
import {
  HubspotContactsService,
  HubspotContactWriteInput,
} from '../integrations/hubspot/contacts/contacts.service';
import { HubspotDealsService } from '../integrations/hubspot/deals/deals.service';
import {
  HubspotCompanySummary,
  HubspotContactSummary,
  HubspotDealSummary,
} from '../integrations/hubspot/hubspot.types';
import type {
  extractContactUpdateDetails,
  extractCreateDetails,
} from './assistant-command.helpers';
import type { AssistantCommandResult } from './assistant.types';

/**
 * Assistant-facing facade around the HubSpot CRM resource services.
 *
 * Mirrors the formatting / messaging style of the GHL paths in
 * `AssistantCommandService` (formatContact, "Here's who you've got recently"
 * etc.) but stays decoupled from the broader assistant logic — the orchestrator
 * just picks GHL vs HubSpot based on the user's provider and delegates.
 */
@Injectable()
export class HubspotCommandService {
  constructor(
    private readonly contacts: HubspotContactsService,
    private readonly deals: HubspotDealsService,
    private readonly companies: HubspotCompaniesService,
  ) {}

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listLatestContacts(userId: string): Promise<AssistantCommandResult> {
    const { results } = await this.contacts.list(userId, { limit: 10 });
    if (results.length === 0) {
      return { response: "You don't have any contacts in HubSpot yet.", status: 'success' };
    }
    return {
      response: `Here's who you've got recently:\n${results.map((c) => this.formatContact(c)).join('\n')}`,
      status: 'success',
      contextPatch: { lastContactId: results[0].id, lastContactName: results[0].name },
    };
  }

  async findContact(userId: string, query: string): Promise<AssistantCommandResult> {
    if (!query?.trim()) {
      return {
        response: 'Who are you looking for? A name, phone, or email works.',
        status: 'error',
      };
    }
    const results = await this.findMatchingContacts(userId, query);
    if (results.length === 0) {
      return { response: `No one in HubSpot matches "${query}".`, status: 'error' };
    }
    const top = results[0];
    return {
      response:
        results.length === 1
          ? `Found them:\n${this.formatContact(top)}`
          : `Found ${results.length} people:\n${results.slice(0, 5).map((c) => this.formatContact(c)).join('\n')}`,
      status: 'success',
      contextPatch: { lastContactId: top.id, lastContactName: top.name },
    };
  }

  async createContact(
    userId: string,
    details: ReturnType<typeof extractCreateDetails>,
  ): Promise<AssistantCommandResult> {
    if (!details.name || (!details.phone && !details.email)) {
      return {
        response: 'I need a name and either a phone number or email.',
        status: 'error',
      };
    }
    const { firstName, lastName } = splitName(details.name);
    const created = await this.contacts.create(userId, {
      firstName,
      lastName,
      phone: details.phone,
      email: details.email,
    });
    const bits = [
      created.phone ? `phone ${created.phone}` : null,
      created.email ? `email ${created.email}` : null,
    ]
      .filter(Boolean)
      .join(', ');
    return {
      response: `Added ${created.name}${bits ? ` (${bits})` : ''} to HubSpot.`,
      status: 'success',
      contextPatch: { lastContactId: created.id, lastContactName: created.name },
    };
  }

  async updateContact(
    userId: string,
    details: ReturnType<typeof extractContactUpdateDetails>,
  ): Promise<AssistantCommandResult> {
    // Wrong-contact safety mirrors the GHL path: an explicit name in the
    // user's message ALWAYS wins over a contactId carried from session
    // context (the previous turn's lastContactId). Otherwise "update Jordan
    // Smith" right after viewing "Random Contact" would update the wrong
    // record. See assistant-command.service.ts#updateContactFromDetails for
    // the original incident this protects against.
    const query = details.query?.trim();
    let contactId: string | undefined;
    let resolvedName: string | undefined;

    if (query) {
      const matches = await this.findMatchingContacts(userId, query);
      if (matches.length === 0) {
        return { response: `No contact matches "${query}" in HubSpot.`, status: 'error' };
      }
      if (matches.length > 1) {
        return {
          response: `Which one should I update?\n${matches
            .slice(0, 5)
            .map((c) => this.formatContact(c))
            .join('\n')}`,
          status: 'error',
        };
      }
      contactId = matches[0].id;
      resolvedName = matches[0].name;
    } else if (details.contactId) {
      contactId = details.contactId;
    } else {
      return {
        response: 'Who should I update? Give me a name, phone, or email.',
        status: 'error',
      };
    }

    const patch: HubspotContactWriteInput = {};
    if (details.newFirstName) patch.firstName = details.newFirstName;
    if (details.newLastName) patch.lastName = details.newLastName;
    if (details.newName) {
      const parts = splitName(details.newName);
      patch.firstName = parts.firstName;
      patch.lastName = parts.lastName;
    }
    if (details.newPhone) patch.phone = details.newPhone;
    if (details.newEmail) patch.email = details.newEmail;

    if (Object.keys(patch).length === 0) {
      return {
        response: `What should I update on ${resolvedName ?? 'this contact'}? (phone, email, or name)`,
        status: 'error',
      };
    }

    const updated = await this.contacts.update(userId, contactId, patch);
    const changed = Object.entries(patch)
      .map(([k, v]) => `${k} → ${v}`)
      .join(', ');
    return {
      response: `Updated ${updated.name} in HubSpot (${changed}).`,
      status: 'success',
      contextPatch: { lastContactId: updated.id, lastContactName: updated.name },
      clearPendingIntent: true,
    };
  }

  async deleteContact(
    userId: string,
    query: string,
  ): Promise<AssistantCommandResult> {
    const trimmed = query?.trim();
    if (!trimmed) {
      return {
        response: 'Who should I remove? Give me a name, phone, or email.',
        status: 'error',
      };
    }
    const matches = await this.findMatchingContacts(userId, trimmed);
    if (matches.length === 0) {
      return { response: `No one in HubSpot matches "${trimmed}".`, status: 'error' };
    }
    if (matches.length > 1) {
      return {
        response: `Which one?\n${matches
          .slice(0, 5)
          .map((c) => this.formatContact(c))
          .join('\n')}`,
        status: 'error',
      };
    }
    await this.contacts.delete(userId, matches[0].id);
    return {
      response: `Removed ${matches[0].name} from HubSpot.`,
      status: 'success',
    };
  }

  private async findMatchingContacts(
    userId: string,
    query: string,
  ): Promise<HubspotContactSummary[]> {
    const { results } = await this.contacts.search(userId, {
      q: query.trim(),
      limit: 10,
    });
    return results;
  }

  // ── Deals (HubSpot equivalent of GHL opportunities) ────────────────────────

  async listRecentDeals(userId: string): Promise<AssistantCommandResult> {
    const { results } = await this.deals.list(userId, { limit: 10 });
    if (results.length === 0) {
      return { response: "You don't have any deals in HubSpot yet.", status: 'success' };
    }
    return {
      response: `Here's your recent deals:\n${results.map((d) => this.formatDeal(d)).join('\n')}`,
      status: 'success',
    };
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  async listRecentCompanies(userId: string): Promise<AssistantCommandResult> {
    const { results } = await this.companies.list(userId, { limit: 10 });
    if (results.length === 0) {
      return { response: "You don't have any companies in HubSpot yet.", status: 'success' };
    }
    return {
      response: `Here's your recent companies:\n${results.map((c) => this.formatCompany(c)).join('\n')}`,
      status: 'success',
    };
  }

  // ── Formatters ─────────────────────────────────────────────────────────────

  private formatContact(contact: HubspotContactSummary): string {
    const bits = [contact.email, contact.phone].filter(Boolean).join(' · ');
    return `· ${contact.name}${bits ? ` — ${bits}` : ''}`;
  }

  private formatDeal(deal: HubspotDealSummary): string {
    const money =
      typeof deal.amount === 'number' && Number.isFinite(deal.amount)
        ? ` — $${deal.amount.toLocaleString()}`
        : '';
    const stage = deal.stage ? ` (${deal.stage})` : '';
    return `· ${deal.name}${money}${stage}`;
  }

  private formatCompany(company: HubspotCompanySummary): string {
    const trailing = [company.domain, company.industry, company.city].filter(Boolean).join(' · ');
    return `· ${company.name}${trailing ? ` — ${trailing}` : ''}`;
  }
}

function splitName(full: string): { firstName: string; lastName?: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '' };
  const [firstName, ...rest] = parts;
  return {
    firstName,
    lastName: rest.length > 0 ? rest.join(' ') : undefined,
  };
}
