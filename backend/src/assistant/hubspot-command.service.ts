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
  CompanyQuery,
  extractCompanyContactAssociation,
  extractCompanyCreateDetails,
  extractCompanyDealAssociation,
  extractCompanyUpdateDetails,
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
  //
  // CRUD + association surface mirroring the contact methods above. Each write
  // method resolves the target company (by id, name, or domain) via
  // `resolveCompany`, then delegates to `HubspotCompaniesService` (which owns
  // the HubSpot v3 / v4 API translations). Successful writes set
  // `contextPatch.lastCompanyId/Name` so follow-ups like "update it" or
  // "attach Sarah to that company" resolve via session merge.

  async listLatestCompanies(userId: string): Promise<AssistantCommandResult> {
    const { results } = await this.companies.list(userId, { limit: 10 });
    if (results.length === 0) {
      return { response: "You don't have any companies in HubSpot yet.", status: 'success' };
    }
    return {
      response: `Here's your recent companies:\n${results
        .map((c) => this.formatCompany(c))
        .join('\n')}`,
      status: 'success',
      contextPatch: { lastCompanyId: results[0].id, lastCompanyName: results[0].name },
    };
  }

  /** @deprecated Use {@link listLatestCompanies}. Kept so heuristics keep working. */
  async listRecentCompanies(userId: string): Promise<AssistantCommandResult> {
    return this.listLatestCompanies(userId);
  }

  async findCompany(
    userId: string,
    query: CompanyQuery,
  ): Promise<AssistantCommandResult> {
    const term = query.name?.trim() || query.domain?.trim() || query.id?.trim();
    if (!term) {
      return {
        response: 'Which company are you looking for? A name or domain works.',
        status: 'error',
      };
    }

    // Direct id lookup short-circuits the search API.
    if (query.id?.trim()) {
      const company = await this.companies.getById(userId, query.id.trim());
      return {
        response: `Found it:\n${this.formatCompany(company)}`,
        status: 'success',
        contextPatch: { lastCompanyId: company.id, lastCompanyName: company.name },
      };
    }

    const matches = await this.findMatchingCompanies(userId, term);
    if (matches.length === 0) {
      return { response: `No company in HubSpot matches "${term}".`, status: 'error' };
    }
    const top = matches[0];
    return {
      response:
        matches.length === 1
          ? `Found it:\n${this.formatCompany(top)}`
          : `Found ${matches.length} companies:\n${matches
              .slice(0, 5)
              .map((c) => this.formatCompany(c))
              .join('\n')}`,
      status: 'success',
      contextPatch: { lastCompanyId: top.id, lastCompanyName: top.name },
    };
  }

  async createCompany(
    userId: string,
    details: ReturnType<typeof extractCompanyCreateDetails>,
  ): Promise<AssistantCommandResult> {
    if (!details.name) {
      return { response: 'What should I name the new company?', status: 'error' };
    }
    const created = await this.companies.create(userId, {
      name: details.name,
      domain: details.domain,
      phone: details.phone,
      industry: details.industry,
      city: details.city,
      state: details.state,
      country: details.country,
      numberOfEmployees: details.numberOfEmployees,
      description: details.description,
      website: details.website,
    });
    const bits = [
      created.domain ? `domain ${created.domain}` : null,
      created.industry ? `industry ${created.industry}` : null,
      created.city ? `in ${created.city}` : null,
    ]
      .filter(Boolean)
      .join(', ');
    return {
      response: `Added ${created.name}${bits ? ` (${bits})` : ''} to HubSpot.`,
      status: 'success',
      contextPatch: { lastCompanyId: created.id, lastCompanyName: created.name },
    };
  }

  async updateCompany(
    userId: string,
    details: ReturnType<typeof extractCompanyUpdateDetails>,
  ): Promise<AssistantCommandResult> {
    const resolved = await this.resolveCompany(userId, details.query);
    if (resolved.kind === 'missing') return resolved.result;

    const patch: Parameters<HubspotCompaniesService['update']>[2] = {};
    if (details.newName) patch.name = details.newName;
    if (details.domain) patch.domain = details.domain;
    if (details.phone) patch.phone = details.phone;
    if (details.industry) patch.industry = details.industry;
    if (details.city) patch.city = details.city;
    if (details.state) patch.state = details.state;
    if (details.country) patch.country = details.country;
    if (typeof details.numberOfEmployees === 'number') {
      patch.numberOfEmployees = details.numberOfEmployees;
    }
    if (details.description) patch.description = details.description;
    if (details.website) patch.website = details.website;

    if (Object.keys(patch).length === 0) {
      return {
        response: `What should I change on ${resolved.company.name}? (name, domain, phone, industry, city, state, country, employees, description, website)`,
        status: 'error',
      };
    }

    const updated = await this.companies.update(userId, resolved.company.id, patch);
    const changed = Object.entries(patch)
      .map(([k, v]) => `${k} → ${v}`)
      .join(', ');
    return {
      response: `Updated ${updated.name} in HubSpot (${changed}).`,
      status: 'success',
      contextPatch: { lastCompanyId: updated.id, lastCompanyName: updated.name },
      clearPendingIntent: true,
    };
  }

  async deleteCompany(
    userId: string,
    query: CompanyQuery,
  ): Promise<AssistantCommandResult> {
    const resolved = await this.resolveCompany(userId, query);
    if (resolved.kind === 'missing') return resolved.result;
    await this.companies.delete(userId, resolved.company.id);
    return {
      response: `Removed ${resolved.company.name} from HubSpot.`,
      status: 'success',
    };
  }

  async attachContactToCompany(
    userId: string,
    details: ReturnType<typeof extractCompanyContactAssociation>,
  ): Promise<AssistantCommandResult> {
    return this.runContactAssociation(userId, details, 'attach');
  }

  async detachContactFromCompany(
    userId: string,
    details: ReturnType<typeof extractCompanyContactAssociation>,
  ): Promise<AssistantCommandResult> {
    return this.runContactAssociation(userId, details, 'detach');
  }

  async attachDealToCompany(
    userId: string,
    details: ReturnType<typeof extractCompanyDealAssociation>,
  ): Promise<AssistantCommandResult> {
    return this.runDealAssociation(userId, details, 'attach');
  }

  async detachDealFromCompany(
    userId: string,
    details: ReturnType<typeof extractCompanyDealAssociation>,
  ): Promise<AssistantCommandResult> {
    return this.runDealAssociation(userId, details, 'detach');
  }

  // ── Private association runners ────────────────────────────────────────────

  private async runContactAssociation(
    userId: string,
    details: ReturnType<typeof extractCompanyContactAssociation>,
    mode: 'attach' | 'detach',
  ): Promise<AssistantCommandResult> {
    const company = await this.resolveCompany(userId, details.company);
    if (company.kind === 'missing') return company.result;

    const contact = await this.resolveContact(userId, details.contact);
    if (contact.kind === 'missing') return contact.result;

    if (mode === 'attach') {
      await this.companies.associateContact(userId, company.company.id, contact.contact.id);
      return {
        response: `Attached ${contact.contact.name} to ${company.company.name}.`,
        status: 'success',
        contextPatch: {
          lastCompanyId: company.company.id,
          lastCompanyName: company.company.name,
          lastContactId: contact.contact.id,
          lastContactName: contact.contact.name,
        },
      };
    }
    await this.companies.disassociateContact(userId, company.company.id, contact.contact.id);
    return {
      response: `Detached ${contact.contact.name} from ${company.company.name}.`,
      status: 'success',
      contextPatch: {
        lastCompanyId: company.company.id,
        lastCompanyName: company.company.name,
        lastContactId: contact.contact.id,
        lastContactName: contact.contact.name,
      },
    };
  }

  private async runDealAssociation(
    userId: string,
    details: ReturnType<typeof extractCompanyDealAssociation>,
    mode: 'attach' | 'detach',
  ): Promise<AssistantCommandResult> {
    const company = await this.resolveCompany(userId, details.company);
    if (company.kind === 'missing') return company.result;

    const deal = await this.resolveDeal(userId, details.deal);
    if (deal.kind === 'missing') return deal.result;

    if (mode === 'attach') {
      await this.companies.associateDeal(userId, company.company.id, deal.deal.id);
      return {
        response: `Attached deal "${deal.deal.name}" to ${company.company.name}.`,
        status: 'success',
        contextPatch: {
          lastCompanyId: company.company.id,
          lastCompanyName: company.company.name,
        },
      };
    }
    await this.companies.disassociateDeal(userId, company.company.id, deal.deal.id);
    return {
      response: `Detached deal "${deal.deal.name}" from ${company.company.name}.`,
      status: 'success',
      contextPatch: {
        lastCompanyId: company.company.id,
        lastCompanyName: company.company.name,
      },
    };
  }

  // ── Resolvers ──────────────────────────────────────────────────────────────
  //
  // Standard "find or ask" pattern shared by every company write. Returns
  // either an `ok` shape carrying the resolved entity, or a `missing` shape
  // carrying a friendly response the executor can short-circuit on.

  private async resolveCompany(
    userId: string,
    query: CompanyQuery,
  ): Promise<
    | { kind: 'ok'; company: HubspotCompanySummary }
    | { kind: 'missing'; result: AssistantCommandResult }
  > {
    if (query.id?.trim()) {
      const company = await this.companies.getById(userId, query.id.trim());
      return { kind: 'ok', company };
    }
    const term = query.name?.trim() || query.domain?.trim();
    if (!term) {
      return {
        kind: 'missing',
        result: {
          response: 'Which company? Give me a name or domain.',
          status: 'error',
        },
      };
    }
    const matches = await this.findMatchingCompanies(userId, term);
    if (matches.length === 0) {
      return {
        kind: 'missing',
        result: { response: `No company in HubSpot matches "${term}".`, status: 'error' },
      };
    }
    if (matches.length > 1) {
      return {
        kind: 'missing',
        result: {
          response: `Which one?\n${matches
            .slice(0, 5)
            .map((c) => this.formatCompany(c))
            .join('\n')}`,
          status: 'error',
        },
      };
    }
    return { kind: 'ok', company: matches[0] };
  }

  private async resolveContact(
    userId: string,
    selector: { id?: string; query: string },
  ): Promise<
    | { kind: 'ok'; contact: HubspotContactSummary }
    | { kind: 'missing'; result: AssistantCommandResult }
  > {
    if (selector.id?.trim()) {
      // No getById on the service today; search by id is fine since HubSpot
      // includes id in the result. But the contacts service doesn't expose
      // it either — fall through to query so we surface a friendly miss.
    }
    const term = selector.query?.trim();
    if (!term) {
      return {
        kind: 'missing',
        result: {
          response: 'Which contact? Give me a name, phone, or email.',
          status: 'error',
        },
      };
    }
    const matches = await this.findMatchingContacts(userId, term);
    if (matches.length === 0) {
      return {
        kind: 'missing',
        result: { response: `No contact in HubSpot matches "${term}".`, status: 'error' },
      };
    }
    if (matches.length > 1) {
      return {
        kind: 'missing',
        result: {
          response: `Which contact?\n${matches
            .slice(0, 5)
            .map((c) => this.formatContact(c))
            .join('\n')}`,
          status: 'error',
        },
      };
    }
    return { kind: 'ok', contact: matches[0] };
  }

  /**
   * Resolve a deal by id (fast path) or by name (recent-deals scan).
   *
   * HubSpot has no deal-search method on our client yet, so name resolution
   * falls back to listing the 25 most-recent deals and matching by case-
   * insensitive substring. Good enough for the common "attach the Acme deal"
   * follow-up; users with stale deals can always pass the explicit deal id.
   */
  private async resolveDeal(
    userId: string,
    selector: { id?: string; name: string },
  ): Promise<
    | { kind: 'ok'; deal: HubspotDealSummary }
    | { kind: 'missing'; result: AssistantCommandResult }
  > {
    if (selector.id?.trim()) {
      const deal = await this.deals.getById(userId, selector.id.trim());
      return { kind: 'ok', deal };
    }
    const term = selector.name?.trim();
    if (!term) {
      return {
        kind: 'missing',
        result: {
          response: 'Which deal? Give me the deal name or id.',
          status: 'error',
        },
      };
    }
    const { results } = await this.deals.list(userId, { limit: 25 });
    const needle = term.toLowerCase();
    const matches = results.filter((d) => d.name.toLowerCase().includes(needle));
    if (matches.length === 0) {
      return {
        kind: 'missing',
        result: {
          response: `No recent HubSpot deal matches "${term}". Try the deal id instead.`,
          status: 'error',
        },
      };
    }
    if (matches.length > 1) {
      return {
        kind: 'missing',
        result: {
          response: `Which deal?\n${matches
            .slice(0, 5)
            .map((d) => this.formatDeal(d))
            .join('\n')}`,
          status: 'error',
        },
      };
    }
    return { kind: 'ok', deal: matches[0] };
  }

  private async findMatchingCompanies(
    userId: string,
    query: string,
  ): Promise<HubspotCompanySummary[]> {
    const { results } = await this.companies.search(userId, {
      q: query.trim(),
      limit: 10,
    });
    return results;
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
