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
  HubspotOrderSummary,
  HubspotProductSummary,
  HubspotTicketSummary,
} from '../integrations/hubspot/hubspot.types';
import {
  HubspotOrdersService,
  HubspotOrderWriteInput,
} from '../integrations/hubspot/orders/orders.service';
import {
  HubspotProductsService,
  HubspotProductWriteInput,
} from '../integrations/hubspot/products/products.service';
import {
  HubspotTicketsService,
  HubspotTicketWriteInput,
} from '../integrations/hubspot/tickets/tickets.service';
import type {
  CompanyQuery,
  extractCompanyContactAssociation,
  extractCompanyCreateDetails,
  extractCompanyDealAssociation,
  extractCompanyUpdateDetails,
  extractContactUpdateDetails,
  extractCreateDetails,
  extractOrderCompanyAssociation,
  extractOrderContactAssociation,
  extractOrderCreateDetails,
  extractOrderDealAssociation,
  extractOrderUpdateDetails,
  extractProductCreateDetails,
  extractProductUpdateDetails,
  extractTicketCompanyAssociation,
  extractTicketContactAssociation,
  extractTicketCreateDetails,
  extractTicketDealAssociation,
  extractTicketUpdateDetails,
  OrderQuery,
  ProductQuery,
  TicketQuery,
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
    private readonly tickets: HubspotTicketsService,
    private readonly products: HubspotProductsService,
    private readonly orders: HubspotOrdersService,
  ) {}

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listLatestContacts(userId: string): Promise<AssistantCommandResult> {
    const { results } = await this.contacts.list(userId, { limit: 10 });
    if (results.length === 0) {
      return { response: "You don't have any contacts in HubSpot yet.", status: 'success' };
    }
    return {
      response:
        `Here are the contacts you've added most recently in HubSpot:\n${results
          .map((c) => this.formatContact(c))
          .join('\n')}\n\n` +
        "Want a closer look at someone? Just say their name and I'll pull up the details.",
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
          ? `Found them in HubSpot:\n${this.formatContact(top)}\n\n` +
            "I'll keep them in mind — say \"update their phone\" or \"attach them to Acme\" and I'll know who you mean."
          : `Found ${results.length} people in HubSpot — here are the closest matches:\n${results
              .slice(0, 5)
              .map((c) => this.formatContact(c))
              .join('\n')}\n\n` +
            "Tell me which one you mean (a name, email, or phone) and I'll zero in.",
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
      response:
        `Done — ${created.name} is now in HubSpot${bits ? ` (${bits})` : ''}. ` +
        "I'll keep them in mind for follow-ups, so you can say things like " +
        '"update their phone" or "attach them to Acme" and I\'ll know who you mean.',
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
      response:
        `All set — ${updated.name} is updated in HubSpot (${changed}). ` +
        "Want me to tweak something else on this contact, or pull up their full details?",
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
      response:
        `Done — ${matches[0].name} is removed from HubSpot. ` +
        "If that was a mistake, let me know and I can recreate them; otherwise, anything else you'd like me to tidy up?",
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
      response:
        `Here are your most recent deals in HubSpot:\n${results
          .map((d) => this.formatDeal(d))
          .join('\n')}\n\n` +
        "Want to dig into one of them, or attach a deal to a company? Just say the word.",
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
      response:
        `Here are the companies you've added most recently in HubSpot:\n${results
          .map((c) => this.formatCompany(c))
          .join('\n')}\n\n` +
        "Pick one and ask me to pull it up, update a field, or attach a contact — I'll handle the rest.",
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
        response:
          `Found it in HubSpot:\n${this.formatCompany(company)}\n\n` +
          "I'll keep this company in mind — say \"update its industry\" or \"attach Sarah to it\" and I'll know which one you mean.",
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
          ? `Found it in HubSpot:\n${this.formatCompany(top)}\n\n` +
            "I'll keep this company in mind — say \"update its industry\" or \"attach Sarah to it\" and I'll know which one you mean."
          : `Found ${matches.length} companies in HubSpot — here are the closest matches:\n${matches
              .slice(0, 5)
              .map((c) => this.formatCompany(c))
              .join('\n')}\n\n` +
            "Tell me which one you mean (a name or domain) and I'll zero in.",
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
      response:
        `Done — ${created.name} is now in HubSpot${bits ? ` (${bits})` : ''}. ` +
        "I'll keep this company in mind, so you can say things like " +
        '"attach Sarah to it" or "update its industry" and I\'ll know which one you mean.',
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
      response:
        `All set — ${updated.name} is updated in HubSpot (${changed}). ` +
        "Want me to change another field, or attach a contact or deal to it next?",
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
      response:
        `Done — ${resolved.company.name} is removed from HubSpot. ` +
        "Its contacts and deals are still around; let me know if you'd like me to clean any of those up too.",
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
        response:
          `Linked ${contact.contact.name} to ${company.company.name} in HubSpot. ` +
          "I'll remember both, so you can say " +
          '"update their title" or "attach a deal to that company" and I\'ll know who and what you mean.',
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
      response:
        `Unlinked ${contact.contact.name} from ${company.company.name} in HubSpot. ` +
        "Both records are still there — just not associated anymore. " +
        "Want me to attach them to a different company?",
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
        response:
          `Linked the "${deal.deal.name}" deal to ${company.company.name} in HubSpot. ` +
          "I'll keep this company in mind — say " +
          '"show its deals" or "attach Sarah to it" and I\'ll know which one you mean.',
        status: 'success',
        contextPatch: {
          lastCompanyId: company.company.id,
          lastCompanyName: company.company.name,
        },
      };
    }
    await this.companies.disassociateDeal(userId, company.company.id, deal.deal.id);
    return {
      response:
        `Unlinked the "${deal.deal.name}" deal from ${company.company.name} in HubSpot. ` +
        "Both records are still there — just not associated anymore. " +
        "Anything else you'd like to adjust on this company?",
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

  // ── Tickets ──────────────────────────────────────────────────────────────
  //
  // CRUD + association surface mirroring the companies methods above. Writes
  // resolve the target ticket via `resolveTicket` (by id or subject search),
  // then delegate to `HubspotTicketsService`. Successful writes set
  // `contextPatch.lastTicketId/Subject` so follow-ups like "close it" or
  // "attach it to Acme" resolve via session merge.

  async listRecentTickets(userId: string): Promise<AssistantCommandResult> {
    const { results } = await this.tickets.list(userId, { limit: 10 });
    if (results.length === 0) {
      return { response: "You don't have any tickets in HubSpot yet.", status: 'success' };
    }
    return {
      response:
        `Here are your most recent tickets in HubSpot:\n${results
          .map((t) => this.formatTicket(t))
          .join('\n')}\n\n` +
        "Want to open one, change its priority, or attach it to a contact or company? Just say the word.",
      status: 'success',
      contextPatch: { lastTicketId: results[0].id, lastTicketSubject: results[0].subject },
    };
  }

  async findTicket(userId: string, query: string): Promise<AssistantCommandResult> {
    if (!query?.trim()) {
      return {
        response: 'Which ticket are you looking for? A subject or keyword works.',
        status: 'error',
      };
    }
    const matches = await this.findMatchingTickets(userId, query);
    if (matches.length === 0) {
      return { response: `No ticket in HubSpot matches "${query}".`, status: 'error' };
    }
    const top = matches[0];
    return {
      response:
        matches.length === 1
          ? `Found it in HubSpot:\n${this.formatTicket(top)}\n\n` +
            "I'll keep this ticket in mind — say \"raise its priority\" or \"attach it to Acme\" and I'll know which one you mean."
          : `Found ${matches.length} tickets in HubSpot — here are the closest matches:\n${matches
              .slice(0, 5)
              .map((t) => this.formatTicket(t))
              .join('\n')}\n\n` +
            "Tell me which one you mean (the subject works) and I'll zero in.",
      status: 'success',
      contextPatch: { lastTicketId: top.id, lastTicketSubject: top.subject },
    };
  }

  async createTicket(
    userId: string,
    details: ReturnType<typeof extractTicketCreateDetails>,
  ): Promise<AssistantCommandResult> {
    if (!details.subject) {
      return { response: 'What should the ticket be about? Give me a subject.', status: 'error' };
    }
    const created = await this.tickets.create(userId, {
      subject: details.subject,
      content: details.content,
      priority: details.priority,
      pipeline: details.pipeline,
      stage: details.stage,
    });
    const bits = [
      created.priority ? `priority ${created.priority}` : null,
    ]
      .filter(Boolean)
      .join(', ');
    return {
      response:
        `Done — the "${created.subject}" ticket is now in HubSpot${bits ? ` (${bits})` : ''}. ` +
        "I'll keep this ticket in mind, so you can say things like " +
        '"raise its priority" or "attach it to Acme" and I\'ll know which one you mean.',
      status: 'success',
      contextPatch: { lastTicketId: created.id, lastTicketSubject: created.subject },
    };
  }

  async updateTicket(
    userId: string,
    details: ReturnType<typeof extractTicketUpdateDetails>,
  ): Promise<AssistantCommandResult> {
    const resolved = await this.resolveTicket(userId, details.query);
    if (resolved.kind === 'missing') return resolved.result;

    const patch: HubspotTicketWriteInput = {};
    if (details.subject) patch.subject = details.subject;
    if (details.content) patch.content = details.content;
    if (details.priority) patch.priority = details.priority;
    if (details.pipeline) patch.pipeline = details.pipeline;
    if (details.stage) patch.stage = details.stage;

    if (Object.keys(patch).length === 0) {
      return {
        response: `What should I change on "${resolved.ticket.subject}"? (subject, content, priority, pipeline, or stage)`,
        status: 'error',
      };
    }

    const updated = await this.tickets.update(userId, resolved.ticket.id, patch);
    const changed = Object.entries(patch)
      .map(([k, v]) => `${k} → ${v}`)
      .join(', ');
    return {
      response:
        `All set — the "${updated.subject}" ticket is updated in HubSpot (${changed}). ` +
        "Want me to change another field, or attach it to a contact, company, or deal next?",
      status: 'success',
      contextPatch: { lastTicketId: updated.id, lastTicketSubject: updated.subject },
      clearPendingIntent: true,
    };
  }

  async deleteTicket(userId: string, query: string): Promise<AssistantCommandResult> {
    const resolved = await this.resolveTicket(userId, { subject: query });
    if (resolved.kind === 'missing') return resolved.result;
    await this.tickets.delete(userId, resolved.ticket.id);
    return {
      response:
        `Done — the "${resolved.ticket.subject}" ticket is removed from HubSpot. ` +
        "If that was a mistake, let me know and I can recreate it; otherwise, anything else you'd like me to tidy up?",
      status: 'success',
    };
  }

  async attachTicketToContact(
    userId: string,
    details: ReturnType<typeof extractTicketContactAssociation>,
  ): Promise<AssistantCommandResult> {
    const ticket = await this.resolveTicket(userId, details.ticket);
    if (ticket.kind === 'missing') return ticket.result;
    const contact = await this.resolveContact(userId, details.contact);
    if (contact.kind === 'missing') return contact.result;
    await this.tickets.associateContact(userId, ticket.ticket.id, contact.contact.id);
    return {
      response:
        `Linked the "${ticket.ticket.subject}" ticket to ${contact.contact.name} in HubSpot. ` +
        "I'll remember both, so you can keep working with either one.",
      status: 'success',
      contextPatch: {
        lastTicketId: ticket.ticket.id,
        lastTicketSubject: ticket.ticket.subject,
        lastContactId: contact.contact.id,
        lastContactName: contact.contact.name,
      },
    };
  }

  async detachTicketFromContact(
    userId: string,
    details: ReturnType<typeof extractTicketContactAssociation>,
  ): Promise<AssistantCommandResult> {
    const ticket = await this.resolveTicket(userId, details.ticket);
    if (ticket.kind === 'missing') return ticket.result;
    const contact = await this.resolveContact(userId, details.contact);
    if (contact.kind === 'missing') return contact.result;
    await this.tickets.disassociateContact(userId, ticket.ticket.id, contact.contact.id);
    return {
      response:
        `Unlinked the "${ticket.ticket.subject}" ticket from ${contact.contact.name} in HubSpot. ` +
        "Both records are still there — just not associated anymore.",
      status: 'success',
      contextPatch: {
        lastTicketId: ticket.ticket.id,
        lastTicketSubject: ticket.ticket.subject,
        lastContactId: contact.contact.id,
        lastContactName: contact.contact.name,
      },
    };
  }

  async attachTicketToCompany(
    userId: string,
    details: ReturnType<typeof extractTicketCompanyAssociation>,
  ): Promise<AssistantCommandResult> {
    const ticket = await this.resolveTicket(userId, details.ticket);
    if (ticket.kind === 'missing') return ticket.result;
    const company = await this.resolveCompany(userId, details.company);
    if (company.kind === 'missing') return company.result;
    await this.tickets.associateCompany(userId, ticket.ticket.id, company.company.id);
    return {
      response:
        `Linked the "${ticket.ticket.subject}" ticket to ${company.company.name} in HubSpot. ` +
        "I'll remember both, so you can keep working with either one.",
      status: 'success',
      contextPatch: {
        lastTicketId: ticket.ticket.id,
        lastTicketSubject: ticket.ticket.subject,
        lastCompanyId: company.company.id,
        lastCompanyName: company.company.name,
      },
    };
  }

  async detachTicketFromCompany(
    userId: string,
    details: ReturnType<typeof extractTicketCompanyAssociation>,
  ): Promise<AssistantCommandResult> {
    const ticket = await this.resolveTicket(userId, details.ticket);
    if (ticket.kind === 'missing') return ticket.result;
    const company = await this.resolveCompany(userId, details.company);
    if (company.kind === 'missing') return company.result;
    await this.tickets.disassociateCompany(userId, ticket.ticket.id, company.company.id);
    return {
      response:
        `Unlinked the "${ticket.ticket.subject}" ticket from ${company.company.name} in HubSpot. ` +
        "Both records are still there — just not associated anymore.",
      status: 'success',
      contextPatch: {
        lastTicketId: ticket.ticket.id,
        lastTicketSubject: ticket.ticket.subject,
        lastCompanyId: company.company.id,
        lastCompanyName: company.company.name,
      },
    };
  }

  async attachTicketToDeal(
    userId: string,
    details: ReturnType<typeof extractTicketDealAssociation>,
  ): Promise<AssistantCommandResult> {
    const ticket = await this.resolveTicket(userId, details.ticket);
    if (ticket.kind === 'missing') return ticket.result;
    const deal = await this.resolveDeal(userId, details.deal);
    if (deal.kind === 'missing') return deal.result;
    await this.tickets.associateDeal(userId, ticket.ticket.id, deal.deal.id);
    return {
      response:
        `Linked the "${ticket.ticket.subject}" ticket to the "${deal.deal.name}" deal in HubSpot. ` +
        "I'll remember both, so you can keep working with either one.",
      status: 'success',
      contextPatch: {
        lastTicketId: ticket.ticket.id,
        lastTicketSubject: ticket.ticket.subject,
      },
    };
  }

  async detachTicketFromDeal(
    userId: string,
    details: ReturnType<typeof extractTicketDealAssociation>,
  ): Promise<AssistantCommandResult> {
    const ticket = await this.resolveTicket(userId, details.ticket);
    if (ticket.kind === 'missing') return ticket.result;
    const deal = await this.resolveDeal(userId, details.deal);
    if (deal.kind === 'missing') return deal.result;
    await this.tickets.disassociateDeal(userId, ticket.ticket.id, deal.deal.id);
    return {
      response:
        `Unlinked the "${ticket.ticket.subject}" ticket from the "${deal.deal.name}" deal in HubSpot. ` +
        "Both records are still there — just not associated anymore.",
      status: 'success',
      contextPatch: {
        lastTicketId: ticket.ticket.id,
        lastTicketSubject: ticket.ticket.subject,
      },
    };
  }

  /**
   * Resolve a ticket by id (fast path) or by subject search. Mirrors
   * `resolveCompany`: returns an `ok` shape carrying the ticket, or a
   * `missing` shape carrying a friendly response the caller short-circuits on.
   */
  private async resolveTicket(
    userId: string,
    query: TicketQuery,
  ): Promise<
    | { kind: 'ok'; ticket: HubspotTicketSummary }
    | { kind: 'missing'; result: AssistantCommandResult }
  > {
    if (query.id?.trim()) {
      const ticket = await this.tickets.getById(userId, query.id.trim());
      return { kind: 'ok', ticket };
    }
    const term = query.subject?.trim();
    if (!term) {
      return {
        kind: 'missing',
        result: { response: 'Which ticket? Give me a subject or keyword.', status: 'error' },
      };
    }
    const matches = await this.findMatchingTickets(userId, term);
    if (matches.length === 0) {
      return {
        kind: 'missing',
        result: { response: `No ticket in HubSpot matches "${term}".`, status: 'error' },
      };
    }
    if (matches.length > 1) {
      return {
        kind: 'missing',
        result: {
          response: `Which one?\n${matches
            .slice(0, 5)
            .map((t) => this.formatTicket(t))
            .join('\n')}`,
          status: 'error',
        },
      };
    }
    return { kind: 'ok', ticket: matches[0] };
  }

  private async findMatchingTickets(
    userId: string,
    query: string,
  ): Promise<HubspotTicketSummary[]> {
    const { results } = await this.tickets.search(userId, {
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

  private formatTicket(ticket: HubspotTicketSummary): string {
    const trailing = [ticket.priority, ticket.stage].filter(Boolean).join(' · ');
    return `· ${ticket.subject}${trailing ? ` — ${trailing}` : ''}`;
  }

  // ── Products ───────────────────────────────────────────────────────────────
  //
  // CRUD surface mirroring the tickets methods above. Products are a HubSpot
  // *library* object with no contact/company/deal associations, so there are no
  // attach/detach methods. Writes resolve the target product via
  // `resolveProduct` (by id or name search) and set `contextPatch.lastProductId
  // /Name` so follow-ups like "raise its price" resolve via session merge.

  async listRecentProducts(userId: string): Promise<AssistantCommandResult> {
    const { results } = await this.products.list(userId, { limit: 10 });
    if (results.length === 0) {
      return { response: "You don't have any products in HubSpot yet.", status: 'success' };
    }
    return {
      response:
        `Here are your most recent products in HubSpot:\n${results
          .map((p) => this.formatProduct(p))
          .join('\n')}\n\n` +
        'Want to open one, change its price, or add a new product? Just say the word.',
      status: 'success',
      contextPatch: { lastProductId: results[0].id, lastProductName: results[0].name },
    };
  }

  async findProduct(userId: string, query: string): Promise<AssistantCommandResult> {
    if (!query?.trim()) {
      return {
        response: 'Which product are you looking for? A name or SKU works.',
        status: 'error',
      };
    }
    const matches = await this.findMatchingProducts(userId, query);
    if (matches.length === 0) {
      return { response: `No product in HubSpot matches "${query}".`, status: 'error' };
    }
    const top = matches[0];
    return {
      response:
        matches.length === 1
          ? `Found it in HubSpot:\n${this.formatProduct(top)}\n\n` +
            "I'll keep this product in mind — say \"raise its price\" and I'll know which one you mean."
          : `Found ${matches.length} products in HubSpot — here are the closest matches:\n${matches
              .slice(0, 5)
              .map((p) => this.formatProduct(p))
              .join('\n')}\n\n` +
            "Tell me which one you mean (the name works) and I'll zero in.",
      status: 'success',
      contextPatch: { lastProductId: top.id, lastProductName: top.name },
    };
  }

  async createProduct(
    userId: string,
    details: ReturnType<typeof extractProductCreateDetails>,
  ): Promise<AssistantCommandResult> {
    if (!details.name) {
      return { response: 'What should the product be called? Give me a name.', status: 'error' };
    }
    const created = await this.products.create(userId, {
      name: details.name,
      price: details.price,
      sku: details.sku,
      description: details.description,
      cost: details.cost,
    });
    const bits = [
      typeof created.price === 'number' ? `$${created.price.toLocaleString()}` : null,
      created.sku ? `SKU ${created.sku}` : null,
    ]
      .filter(Boolean)
      .join(', ');
    return {
      response:
        `Done — the "${created.name}" product is now in HubSpot${bits ? ` (${bits})` : ''}. ` +
        'I\'ll keep this product in mind, so you can say things like "raise its price" and I\'ll know which one you mean.',
      status: 'success',
      contextPatch: { lastProductId: created.id, lastProductName: created.name },
    };
  }

  async updateProduct(
    userId: string,
    details: ReturnType<typeof extractProductUpdateDetails>,
  ): Promise<AssistantCommandResult> {
    const resolved = await this.resolveProduct(userId, details.query);
    if (resolved.kind === 'missing') return resolved.result;

    const patch: HubspotProductWriteInput = {};
    if (details.name) patch.name = details.name;
    if (details.price !== undefined) patch.price = details.price;
    if (details.sku) patch.sku = details.sku;
    if (details.description) patch.description = details.description;
    if (details.cost !== undefined) patch.cost = details.cost;

    if (Object.keys(patch).length === 0) {
      return {
        response: `What should I change on "${resolved.product.name}"? (name, price, SKU, description, or cost)`,
        status: 'error',
      };
    }

    const updated = await this.products.update(userId, resolved.product.id, patch);
    const changed = Object.entries(patch)
      .map(([k, v]) => `${k} → ${v}`)
      .join(', ');
    return {
      response:
        `All set — the "${updated.name}" product is updated in HubSpot (${changed}). ` +
        'Want me to change another field?',
      status: 'success',
      contextPatch: { lastProductId: updated.id, lastProductName: updated.name },
      clearPendingIntent: true,
    };
  }

  async deleteProduct(userId: string, query: string): Promise<AssistantCommandResult> {
    const resolved = await this.resolveProduct(userId, { name: query });
    if (resolved.kind === 'missing') return resolved.result;
    await this.products.delete(userId, resolved.product.id);
    return {
      response:
        `Done — the "${resolved.product.name}" product is removed from HubSpot. ` +
        "If that was a mistake, let me know and I can recreate it; otherwise, anything else you'd like me to tidy up?",
      status: 'success',
    };
  }

  /**
   * Resolve a product by id (fast path) or by name search. Mirrors
   * `resolveTicket`: returns an `ok` shape carrying the product, or a `missing`
   * shape carrying a friendly response the caller short-circuits on.
   */
  private async resolveProduct(
    userId: string,
    query: ProductQuery,
  ): Promise<
    | { kind: 'ok'; product: HubspotProductSummary }
    | { kind: 'missing'; result: AssistantCommandResult }
  > {
    if (query.id?.trim()) {
      const product = await this.products.getById(userId, query.id.trim());
      return { kind: 'ok', product };
    }
    const term = query.name?.trim();
    if (!term) {
      return {
        kind: 'missing',
        result: { response: 'Which product? Give me a name or SKU.', status: 'error' },
      };
    }
    const matches = await this.findMatchingProducts(userId, term);
    if (matches.length === 0) {
      return {
        kind: 'missing',
        result: { response: `No product in HubSpot matches "${term}".`, status: 'error' },
      };
    }
    if (matches.length > 1) {
      return {
        kind: 'missing',
        result: {
          response: `Which one?\n${matches
            .slice(0, 5)
            .map((p) => this.formatProduct(p))
            .join('\n')}`,
          status: 'error',
        },
      };
    }
    return { kind: 'ok', product: matches[0] };
  }

  private async findMatchingProducts(
    userId: string,
    query: string,
  ): Promise<HubspotProductSummary[]> {
    const { results } = await this.products.search(userId, {
      q: query.trim(),
      limit: 10,
    });
    return results;
  }

  private formatProduct(product: HubspotProductSummary): string {
    const money =
      typeof product.price === 'number' && Number.isFinite(product.price)
        ? ` — $${product.price.toLocaleString()}`
        : '';
    const sku = product.sku ? ` (SKU ${product.sku})` : '';
    return `· ${product.name}${money}${sku}`;
  }

  // ── Orders ─────────────────────────────────────────────────────────────────
  //
  // CRUD + association surface mirroring the tickets methods above. Orders use
  // HubSpot's commerce pipelines/stages (defaulted server-side on create) and
  // support Contact / Company / Deal associations. Writes resolve the target
  // order via `resolveOrder` (by id or name search), then delegate to
  // `HubspotOrdersService`. Successful writes set `contextPatch.lastOrderId
  // /Name` so follow-ups like "mark it shipped" or "attach it to Acme" resolve
  // via session merge.

  async listRecentOrders(userId: string): Promise<AssistantCommandResult> {
    const { results } = await this.orders.list(userId, { limit: 10 });
    if (results.length === 0) {
      return { response: "You don't have any orders in HubSpot yet.", status: 'success' };
    }
    return {
      response:
        `Here are your most recent orders in HubSpot:\n${results
          .map((o) => this.formatOrder(o))
          .join('\n')}\n\n` +
        "Want to open one, change its status, or attach it to a contact, company, or deal? Just say the word.",
      status: 'success',
      contextPatch: { lastOrderId: results[0].id, lastOrderName: results[0].name },
    };
  }

  async findOrder(userId: string, query: string): Promise<AssistantCommandResult> {
    if (!query?.trim()) {
      return {
        response: 'Which order are you looking for? A name or keyword works.',
        status: 'error',
      };
    }
    const matches = await this.findMatchingOrders(userId, query);
    if (matches.length === 0) {
      return { response: `No order in HubSpot matches "${query}".`, status: 'error' };
    }
    const top = matches[0];
    return {
      response:
        matches.length === 1
          ? `Found it in HubSpot:\n${this.formatOrder(top)}\n\n` +
            "I'll keep this order in mind — say \"mark it shipped\" or \"attach it to Acme\" and I'll know which one you mean."
          : `Found ${matches.length} orders in HubSpot — here are the closest matches:\n${matches
              .slice(0, 5)
              .map((o) => this.formatOrder(o))
              .join('\n')}\n\n` +
            "Tell me which one you mean (the name works) and I'll zero in.",
      status: 'success',
      contextPatch: { lastOrderId: top.id, lastOrderName: top.name },
    };
  }

  async createOrder(
    userId: string,
    details: ReturnType<typeof extractOrderCreateDetails>,
  ): Promise<AssistantCommandResult> {
    if (!details.name) {
      return { response: 'What should the order be called? Give me a name.', status: 'error' };
    }
    const created = await this.orders.create(userId, {
      name: details.name,
      pipeline: details.pipeline,
      stage: details.stage,
      totalPrice: details.totalPrice,
      currency: details.currency,
      status: details.status,
      ownerId: details.ownerId,
    });
    const bits = [
      typeof created.totalPrice === 'number' ? `$${created.totalPrice.toLocaleString()}` : null,
      created.status ? `status ${created.status}` : null,
    ]
      .filter(Boolean)
      .join(', ');
    return {
      response:
        `Done — the "${created.name}" order is now in HubSpot${bits ? ` (${bits})` : ''}. ` +
        "I'll keep this order in mind, so you can say things like " +
        '"mark it shipped" or "attach it to Acme" and I\'ll know which one you mean.',
      status: 'success',
      contextPatch: { lastOrderId: created.id, lastOrderName: created.name },
    };
  }

  async updateOrder(
    userId: string,
    details: ReturnType<typeof extractOrderUpdateDetails>,
  ): Promise<AssistantCommandResult> {
    const resolved = await this.resolveOrder(userId, details.query);
    if (resolved.kind === 'missing') return resolved.result;

    const patch: HubspotOrderWriteInput = {};
    if (details.name) patch.name = details.name;
    if (details.pipeline) patch.pipeline = details.pipeline;
    if (details.stage) patch.stage = details.stage;
    if (details.totalPrice !== undefined) patch.totalPrice = details.totalPrice;
    if (details.currency) patch.currency = details.currency;
    if (details.status) patch.status = details.status;
    if (details.ownerId) patch.ownerId = details.ownerId;

    if (Object.keys(patch).length === 0) {
      return {
        response: `What should I change on "${resolved.order.name}"? (name, total price, status, currency, pipeline, or stage)`,
        status: 'error',
      };
    }

    const updated = await this.orders.update(userId, resolved.order.id, patch);
    const changed = Object.entries(patch)
      .map(([k, v]) => `${k} → ${v}`)
      .join(', ');
    return {
      response:
        `All set — the "${updated.name}" order is updated in HubSpot (${changed}). ` +
        "Want me to change another field, or attach it to a contact, company, or deal next?",
      status: 'success',
      contextPatch: { lastOrderId: updated.id, lastOrderName: updated.name },
      clearPendingIntent: true,
    };
  }

  async deleteOrder(userId: string, query: string): Promise<AssistantCommandResult> {
    const resolved = await this.resolveOrder(userId, { name: query });
    if (resolved.kind === 'missing') return resolved.result;
    await this.orders.delete(userId, resolved.order.id);
    return {
      response:
        `Done — the "${resolved.order.name}" order is removed from HubSpot. ` +
        "If that was a mistake, let me know and I can recreate it; otherwise, anything else you'd like me to tidy up?",
      status: 'success',
    };
  }

  async attachOrderToContact(
    userId: string,
    details: ReturnType<typeof extractOrderContactAssociation>,
  ): Promise<AssistantCommandResult> {
    const order = await this.resolveOrder(userId, details.order);
    if (order.kind === 'missing') return order.result;
    const contact = await this.resolveContact(userId, details.contact);
    if (contact.kind === 'missing') return contact.result;
    await this.orders.associateContact(userId, order.order.id, contact.contact.id);
    return {
      response:
        `Linked the "${order.order.name}" order to ${contact.contact.name} in HubSpot. ` +
        "I'll remember both, so you can keep working with either one.",
      status: 'success',
      contextPatch: {
        lastOrderId: order.order.id,
        lastOrderName: order.order.name,
        lastContactId: contact.contact.id,
        lastContactName: contact.contact.name,
      },
    };
  }

  async detachOrderFromContact(
    userId: string,
    details: ReturnType<typeof extractOrderContactAssociation>,
  ): Promise<AssistantCommandResult> {
    const order = await this.resolveOrder(userId, details.order);
    if (order.kind === 'missing') return order.result;
    const contact = await this.resolveContact(userId, details.contact);
    if (contact.kind === 'missing') return contact.result;
    await this.orders.disassociateContact(userId, order.order.id, contact.contact.id);
    return {
      response:
        `Unlinked the "${order.order.name}" order from ${contact.contact.name} in HubSpot. ` +
        "Both records are still there — just not associated anymore.",
      status: 'success',
      contextPatch: {
        lastOrderId: order.order.id,
        lastOrderName: order.order.name,
        lastContactId: contact.contact.id,
        lastContactName: contact.contact.name,
      },
    };
  }

  async attachOrderToCompany(
    userId: string,
    details: ReturnType<typeof extractOrderCompanyAssociation>,
  ): Promise<AssistantCommandResult> {
    const order = await this.resolveOrder(userId, details.order);
    if (order.kind === 'missing') return order.result;
    const company = await this.resolveCompany(userId, details.company);
    if (company.kind === 'missing') return company.result;
    await this.orders.associateCompany(userId, order.order.id, company.company.id);
    return {
      response:
        `Linked the "${order.order.name}" order to ${company.company.name} in HubSpot. ` +
        "I'll remember both, so you can keep working with either one.",
      status: 'success',
      contextPatch: {
        lastOrderId: order.order.id,
        lastOrderName: order.order.name,
        lastCompanyId: company.company.id,
        lastCompanyName: company.company.name,
      },
    };
  }

  async detachOrderFromCompany(
    userId: string,
    details: ReturnType<typeof extractOrderCompanyAssociation>,
  ): Promise<AssistantCommandResult> {
    const order = await this.resolveOrder(userId, details.order);
    if (order.kind === 'missing') return order.result;
    const company = await this.resolveCompany(userId, details.company);
    if (company.kind === 'missing') return company.result;
    await this.orders.disassociateCompany(userId, order.order.id, company.company.id);
    return {
      response:
        `Unlinked the "${order.order.name}" order from ${company.company.name} in HubSpot. ` +
        "Both records are still there — just not associated anymore.",
      status: 'success',
      contextPatch: {
        lastOrderId: order.order.id,
        lastOrderName: order.order.name,
        lastCompanyId: company.company.id,
        lastCompanyName: company.company.name,
      },
    };
  }

  async attachOrderToDeal(
    userId: string,
    details: ReturnType<typeof extractOrderDealAssociation>,
  ): Promise<AssistantCommandResult> {
    const order = await this.resolveOrder(userId, details.order);
    if (order.kind === 'missing') return order.result;
    const deal = await this.resolveDeal(userId, details.deal);
    if (deal.kind === 'missing') return deal.result;
    await this.orders.associateDeal(userId, order.order.id, deal.deal.id);
    return {
      response:
        `Linked the "${order.order.name}" order to the "${deal.deal.name}" deal in HubSpot. ` +
        "I'll remember both, so you can keep working with either one.",
      status: 'success',
      contextPatch: {
        lastOrderId: order.order.id,
        lastOrderName: order.order.name,
      },
    };
  }

  async detachOrderFromDeal(
    userId: string,
    details: ReturnType<typeof extractOrderDealAssociation>,
  ): Promise<AssistantCommandResult> {
    const order = await this.resolveOrder(userId, details.order);
    if (order.kind === 'missing') return order.result;
    const deal = await this.resolveDeal(userId, details.deal);
    if (deal.kind === 'missing') return deal.result;
    await this.orders.disassociateDeal(userId, order.order.id, deal.deal.id);
    return {
      response:
        `Unlinked the "${order.order.name}" order from the "${deal.deal.name}" deal in HubSpot. ` +
        "Both records are still there — just not associated anymore.",
      status: 'success',
      contextPatch: {
        lastOrderId: order.order.id,
        lastOrderName: order.order.name,
      },
    };
  }

  /**
   * Resolve an order by id (fast path) or by name search. Mirrors
   * `resolveTicket`: returns an `ok` shape carrying the order, or a `missing`
   * shape carrying a friendly response the caller short-circuits on.
   */
  private async resolveOrder(
    userId: string,
    query: OrderQuery,
  ): Promise<
    | { kind: 'ok'; order: HubspotOrderSummary }
    | { kind: 'missing'; result: AssistantCommandResult }
  > {
    if (query.id?.trim()) {
      const order = await this.orders.getById(userId, query.id.trim());
      return { kind: 'ok', order };
    }
    const term = query.name?.trim();
    if (!term) {
      return {
        kind: 'missing',
        result: { response: 'Which order? Give me a name or keyword.', status: 'error' },
      };
    }
    const matches = await this.findMatchingOrders(userId, term);
    if (matches.length === 0) {
      return {
        kind: 'missing',
        result: { response: `No order in HubSpot matches "${term}".`, status: 'error' },
      };
    }
    if (matches.length > 1) {
      return {
        kind: 'missing',
        result: {
          response: `Which one?\n${matches
            .slice(0, 5)
            .map((o) => this.formatOrder(o))
            .join('\n')}`,
          status: 'error',
        },
      };
    }
    return { kind: 'ok', order: matches[0] };
  }

  private async findMatchingOrders(
    userId: string,
    query: string,
  ): Promise<HubspotOrderSummary[]> {
    const { results } = await this.orders.search(userId, {
      q: query.trim(),
      limit: 10,
    });
    return results;
  }

  private formatOrder(order: HubspotOrderSummary): string {
    const money =
      typeof order.totalPrice === 'number' && Number.isFinite(order.totalPrice)
        ? ` — $${order.totalPrice.toLocaleString()}`
        : '';
    const status = order.status ? ` · ${order.status}` : '';
    return `· ${order.name}${money}${status}`;
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
