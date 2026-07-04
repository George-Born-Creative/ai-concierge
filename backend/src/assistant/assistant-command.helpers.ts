import type { PendingIntent, VoiceIntentPayload } from './assistant.types';

/** Words that, on their own, mean "yes, continue with what we were doing". */
const POSITIVE_CONFIRMATION_RE =
  /^(yes|yeah|yep|yup|ya|y|sure|ok|okay|kk|alright|right|correct|true|proceed|continue|go(?:\s+ahead)?|do\s*it|sounds?\s+good|please(?:\s+do)?|confirmed?)$/i;

/** Words / phrases the user might say to skip an optional field. */
const SKIP_RE = /^(skip|none|no|n\/a|nope|not\s+now|leave\s+(?:it\s+)?(?:blank|empty)|nothing)$/i;

/**
 * Heuristic: looks like a short reply to a previous question, not a brand-new
 * command. We're intentionally permissive — when this returns true, the
 * service still cross-checks with the pending field type before merging.
 */
export function isFollowUpAnswer(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > 120) return false;
  // Strong NEW-task triggers. Phrases like "make it 2500" or "set it to lost"
  // are not on this list because they're answers, not new commands.
  const startsWithStrongCommand =
    /^(create|add\s+(?:a|an|the|new)|delete|remove|cancel|book|schedule|list|show\s+me|find|look\s+up|pull\s+up|search)\b/i.test(
      trimmed,
    );
  if (startsWithStrongCommand) return false;
  // "actually [new command]" is the canonical user pivot — treat as new.
  if (/^actually\b/i.test(trimmed) && /\b(create|add|delete|remove|list|show|find|book|cancel)\b/i.test(trimmed)) {
    return false;
  }
  return true;
}

/**
 * Heuristic: the user is asking a question / going on a conversational tangent
 * rather than answering the previously asked CRM question or issuing a command.
 * Used to route to the chat layer instead of the executor.
 */
export function looksLikeQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.endsWith('?')) return true;
  return /^(what|why|how|when|who|where|which|whose|tell\s+me|explain|describe|help|can\s+you\s+(explain|tell|help)|do\s+you\s+know|is\s+there|are\s+there|before\s+that|wait|hold\s+on|hang\s+on|first|by\s+the\s+way|btw|quick\s+question|one\s+question)\b/i.test(
    trimmed,
  );
}

export function isPositiveConfirmation(text: string): boolean {
  const cleaned = text.trim().toLowerCase().replace(/[.!?,]+$/, '').trim();
  return POSITIVE_CONFIRMATION_RE.test(cleaned);
}

export function isSkipAnswer(text: string): boolean {
  const cleaned = text.trim().toLowerCase().replace(/[.!?,]+$/, '').trim();
  return SKIP_RE.test(cleaned);
}

/**
 * Parse a user's natural-language money answer.
 * Returns the numeric value when parseable, "skip" when the user wants to
 * skip the field, or null when we couldn't understand.
 */
export function parseMonetaryAnswer(text: string): number | 'skip' | null {
  if (isSkipAnswer(text)) return 'skip';

  // Look for the FIRST numeric run in the message — handles "$2,500", "2.5k",
  // "two thousand five hundred", "make it 2500", "around $5000 please" etc.
  const trimmed = text.trim();
  const match = trimmed.match(/-?\d[\d,]*(?:\.\d+)?\s*([kmKM]?)/);
  if (!match) return null;
  const numericPart = match[0].replace(/[,\s]/g, '').replace(/[kmKM]$/, '');
  let value = Number(numericPart);
  if (!Number.isFinite(value)) return null;
  const suffix = match[1]?.toLowerCase();
  if (suffix === 'k') value *= 1_000;
  if (suffix === 'm') value *= 1_000_000;
  return value < 0 ? 0 : value;
}

/** True when a stored pending intent is still within its TTL window. */
export function isPendingIntentValid(pending: PendingIntent | null | undefined): pending is PendingIntent {
  if (!pending) return false;
  if (!pending.intent || !Array.isArray(pending.missing)) return false;
  const ms = Date.parse(pending.expiresAt);
  if (Number.isNaN(ms)) return false;
  return ms > Date.now();
}

/** Default TTL for a pending intent — 30 minutes is plenty for a chat flow. */
export function pendingIntentExpiry(): string {
  return new Date(Date.now() + 30 * 60 * 1000).toISOString();
}

export function entityString(
  entities: Record<string, string | number | boolean | null>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = entities[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

export function entityNumber(
  entities: Record<string, string | number | boolean | null>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = entities[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

export function buildNameFromEntities(
  entities: Record<string, string | number | boolean | null>,
): string {
  const direct = entityString(entities, 'name');
  if (direct) return direct;
  const first = entityString(entities, 'firstName', 'first_name');
  const last = entityString(entities, 'lastName', 'last_name');
  return [first, last].filter(Boolean).join(' ');
}

export function extractSearchQuery(
  entities: Record<string, string | number | boolean | null>,
): string {
  const query = entityString(entities, 'query');
  if (query) return query;
  const name = buildNameFromEntities(entities);
  if (name) return name;
  return entityString(entities, 'phone', 'email') ?? '';
}

export function extractCalendarQuery(
  entities: Record<string, string | number | boolean | null>,
): string {
  return entityString(entities, 'query', 'calendarName', 'calendarId', 'name') ?? '';
}

export function extractCalendarCreateDetails(
  entities: Record<string, string | number | boolean | null>,
) {
  return {
    name: entityString(entities, 'name', 'calendarName') ?? '',
    description: entityString(entities, 'description'),
    isActive:
      entities.isActive === true || entities.isActive === 'true'
        ? true
        : entities.isActive === false || entities.isActive === 'false'
          ? false
          : undefined,
  };
}

export function extractCalendarUpdateDetails(
  entities: Record<string, string | number | boolean | null>,
) {
  return {
    calendarId: entityString(entities, 'calendarId', 'calendar_id'),
    calendarName: entityString(entities, 'calendarName', 'calendar_name', 'query'),
    name: entityString(entities, 'name'),
    description: entityString(entities, 'description'),
    isActive:
      entities.isActive === true || entities.isActive === 'true'
        ? true
        : entities.isActive === false || entities.isActive === 'false'
          ? false
          : undefined,
  };
}

export function extractFreeSlotsDetails(
  entities: Record<string, string | number | boolean | null>,
) {
  return {
    calendarId: entityString(entities, 'calendarId', 'calendar_id'),
    calendarName: entityString(entities, 'calendarName', 'calendar_name', 'name'),
    startDate: entityNumber(entities, 'startDate', 'start_date'),
    endDate: entityNumber(entities, 'endDate', 'end_date'),
    days: entityNumber(entities, 'days'),
    timezone: entityString(entities, 'timezone', 'timeZone'),
    userId: entityString(entities, 'userId', 'user_id'),
  };
}

export function extractAppointmentRange(
  entities: Record<string, string | number | boolean | null>,
) {
  return {
    startTime: entityString(entities, 'startTime', 'start_time'),
    endTime: entityString(entities, 'endTime', 'end_time'),
    days: entityNumber(entities, 'days') ?? undefined,
  };
}

export function extractAppointmentDetails(
  entities: Record<string, string | number | boolean | null>,
) {
  return {
    contactId: entityString(entities, 'contactId', 'contact_id'),
    contactName:
      entityString(entities, 'contactName', 'contact_name') ||
      buildNameFromEntities(entities) ||
      entityString(entities, 'query', 'name'),
    calendarId: entityString(entities, 'calendarId', 'calendar_id'),
    calendarName: entityString(entities, 'calendarName', 'calendar_name'),
    startTime: entityString(entities, 'startTime', 'start_time', 'datetime', 'dateTime'),
    endTime: entityString(entities, 'endTime', 'end_time'),
    durationMinutes: entityNumber(entities, 'durationMinutes', 'duration_minutes', 'duration'),
    title: entityString(entities, 'title'),
    notes: entityString(entities, 'notes', 'description'),
  };
}

export function extractAppointmentCancelQuery(
  entities: Record<string, string | number | boolean | null>,
): string {
  return (
    entityString(entities, 'query') ||
    entityString(entities, 'contactName', 'contact_name') ||
    buildNameFromEntities(entities) ||
    entityString(entities, 'title') ||
    entityString(entities, 'startTime', 'start_time') ||
    ''
  );
}

export function extractCreateDetails(
  entities: Record<string, string | number | boolean | null>,
) {
  return {
    name: entityString(entities, 'name') || buildNameFromEntities(entities) || '',
    phone: entityString(entities, 'phone'),
    email: normalizeSpokenEmail(entityString(entities, 'email')),
  };
}

export function extractContactUpdateDetails(
  entities: Record<string, string | number | boolean | null>,
) {
  return {
    contactId: entityString(entities, 'contactId', 'contact_id'),
    // The thing we're searching for. We deliberately do NOT use the new
    // first/last/email/phone values here — those are the values we want to
    // SET, not the search target.
    query:
      entityString(entities, 'query', 'contactName', 'contact_name') ||
      buildNameFromEntities(entities),
    newName: entityString(entities, 'newName', 'new_name'),
    newFirstName: entityString(entities, 'newFirstName', 'new_first_name'),
    newLastName: entityString(entities, 'newLastName', 'new_last_name'),
    newPhone: entityString(entities, 'newPhone', 'new_phone', 'phone'),
    newEmail: normalizeSpokenEmail(
      entityString(entities, 'newEmail', 'new_email', 'email'),
    ),
  };
}

/**
 * Defensive fallback for spoken emails that slip past the LLM normalizer.
 * Whisper transcribes voice as "john at gmail dot com" / "test underscore
 * one at example dot co dot uk"; the normalizer prompt asks the LLM to
 * reconstruct these into `john@gmail.com` shape, but if it ever forgets we
 * recover here so the assistant doesn't silently lose the email.
 *
 * Returns the cleaned email if it has the shape `<local>@<domain>.<tld>`;
 * otherwise returns the lowercased original (which may not be a valid email
 * — the caller is expected to validate before issuing the API call).
 */
export function normalizeSpokenEmail(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const lower = value.trim().toLowerCase();
  if (!lower) return undefined;
  // Already-valid email: do nothing beyond lowercase + trim.
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lower)) return lower;
  // Apply spoken-word substitutions only when the input doesn't already
  // contain '@' — otherwise we risk garbling a real address that happens
  // to embed the word "at" in the local part.
  const looksSpoken = !lower.includes('@') && /\bat\b/.test(lower);
  if (!looksSpoken) return lower;

  // Tolerate punctuation around the keywords because Whisper happily inserts
  // commas and periods at speech pauses ("john, at gmail. dot com").
  const substituted = lower
    .replace(/[\s,.]+at[\s,.]+/g, '@')
    .replace(/[\s,.]+dot[\s,.]+/g, '.')
    .replace(/[\s,.]+underscore[\s,.]+/g, '_')
    .replace(/[\s,.]+(?:dash|hyphen)[\s,.]+/g, '-')
    .replace(/[\s,.]+plus[\s,.]+/g, '+')
    // Strip any residual stray punctuation / whitespace inside the result.
    .replace(/[\s,]+/g, '')
    // Trailing punctuation Whisper sometimes appends ("…dot com.")
    .replace(/[.,]+$/, '');

  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(substituted)) {
    return substituted;
  }
  // Substitution didn't produce a syntactically valid email; surface the
  // best-effort lowercased original so the caller can decide whether to
  // re-prompt.
  return lower;
}

const OPPORTUNITY_STATUSES = ['open', 'won', 'lost', 'abandoned'] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];
const OPPORTUNITY_STATUS_FILTERS = ['open', 'won', 'lost', 'abandoned', 'all'] as const;
export type OpportunityStatusFilter = (typeof OPPORTUNITY_STATUS_FILTERS)[number];

function normalizeOpportunityStatus(
  value: string | undefined,
): OpportunityStatus | undefined {
  const v = value?.trim().toLowerCase();
  return v && (OPPORTUNITY_STATUSES as readonly string[]).includes(v)
    ? (v as OpportunityStatus)
    : undefined;
}

function normalizeOpportunityStatusFilter(
  value: string | undefined,
): OpportunityStatusFilter | undefined {
  const v = value?.trim().toLowerCase();
  return v && (OPPORTUNITY_STATUS_FILTERS as readonly string[]).includes(v)
    ? (v as OpportunityStatusFilter)
    : undefined;
}

export function extractOpportunityListDetails(
  entities: Record<string, string | number | boolean | null>,
) {
  return {
    pipelineId: entityString(entities, 'pipelineId', 'pipeline_id'),
    pipelineName: entityString(entities, 'pipelineName', 'pipeline_name'),
    pipelineStageId: entityString(entities, 'pipelineStageId', 'pipeline_stage_id', 'stageId'),
    pipelineStageName: entityString(
      entities,
      'pipelineStageName',
      'pipeline_stage_name',
      'stageName',
    ),
    status: normalizeOpportunityStatusFilter(
      entityString(entities, 'status') ?? entityString(entities, 'statusFilter'),
    ),
    contactId: entityString(entities, 'contactId', 'contact_id'),
    contactName:
      entityString(entities, 'contactName', 'contact_name') || buildNameFromEntities(entities),
    query: entityString(entities, 'query'),
    limit: entityNumber(entities, 'limit'),
  };
}

export function extractOpportunityQuery(
  entities: Record<string, string | number | boolean | null>,
): string {
  return (
    entityString(entities, 'opportunityId', 'opportunity_id') ||
    entityString(entities, 'opportunityName', 'opportunity_name') ||
    entityString(entities, 'query') ||
    entityString(entities, 'name') ||
    buildNameFromEntities(entities) ||
    ''
  );
}

export function extractOpportunityCreateDetails(
  entities: Record<string, string | number | boolean | null>,
) {
  return {
    name:
      entityString(entities, 'name', 'opportunityName', 'opportunity_name', 'title') || '',
    pipelineId: entityString(entities, 'pipelineId', 'pipeline_id'),
    pipelineName: entityString(entities, 'pipelineName', 'pipeline_name'),
    pipelineStageId: entityString(entities, 'pipelineStageId', 'pipeline_stage_id', 'stageId'),
    pipelineStageName: entityString(
      entities,
      'pipelineStageName',
      'pipeline_stage_name',
      'stageName',
    ),
    contactId: entityString(entities, 'contactId', 'contact_id'),
    contactName:
      entityString(entities, 'contactName', 'contact_name') || buildNameFromEntities(entities),
    monetaryValue: entityNumber(
      entities,
      'monetaryValue',
      'monetary_value',
      'amount',
      'value',
      'price',
    ),
    monetaryValueSkipped:
      entities.monetaryValueSkipped === true || entities.monetaryValueSkipped === 'true',
    status: normalizeOpportunityStatus(entityString(entities, 'status')),
    assignedTo: entityString(entities, 'assignedTo', 'assigned_to'),
    source: entityString(entities, 'source'),
  };
}

export function extractOpportunityUpdateDetails(
  entities: Record<string, string | number | boolean | null>,
) {
  return {
    opportunityId: entityString(entities, 'opportunityId', 'opportunity_id'),
    opportunityName: entityString(entities, 'opportunityName', 'opportunity_name'),
    query: entityString(entities, 'query'),
    name: entityString(entities, 'name', 'newName'),
    pipelineId: entityString(entities, 'pipelineId', 'pipeline_id'),
    pipelineName: entityString(entities, 'pipelineName', 'pipeline_name'),
    pipelineStageId: entityString(entities, 'pipelineStageId', 'pipeline_stage_id', 'stageId'),
    pipelineStageName: entityString(
      entities,
      'pipelineStageName',
      'pipeline_stage_name',
      'stageName',
    ),
    status: normalizeOpportunityStatus(entityString(entities, 'status')),
    monetaryValue: entityNumber(
      entities,
      'monetaryValue',
      'monetary_value',
      'amount',
      'value',
      'price',
    ),
    assignedTo: entityString(entities, 'assignedTo', 'assigned_to'),
    source: entityString(entities, 'source'),
  };
}

export function extractOpportunityStatusDetails(
  entities: Record<string, string | number | boolean | null>,
) {
  return {
    opportunityId: entityString(entities, 'opportunityId', 'opportunity_id'),
    opportunityName: entityString(entities, 'opportunityName', 'opportunity_name'),
    query: entityString(entities, 'query'),
    status: normalizeOpportunityStatus(entityString(entities, 'status')),
    lostReasonId: entityString(entities, 'lostReasonId', 'lost_reason_id'),
  };
}

export function mergeSessionIntoEntities(
  entities: Record<string, string | number | boolean | null>,
  session: Record<string, unknown> | null | undefined,
): Record<string, string | number | boolean | null> {
  if (!session || typeof session !== 'object') return entities;
  const ctx = session as Record<string, string | undefined>;
  const merged = { ...entities };
  if (!entityString(merged, 'contactId', 'contact_id') && ctx.lastContactId) {
    merged.contactId = ctx.lastContactId;
  }
  if (!entityString(merged, 'contactName', 'contact_name', 'name', 'query') && ctx.lastContactName) {
    merged.contactName = ctx.lastContactName;
  }
  if (!entityString(merged, 'calendarId', 'calendar_id') && ctx.lastCalendarId) {
    merged.calendarId = ctx.lastCalendarId;
  }
  if (!entityString(merged, 'calendarName', 'calendar_name') && ctx.lastCalendarName) {
    merged.calendarName = ctx.lastCalendarName;
  }
  if (!entityString(merged, 'opportunityId', 'opportunity_id') && ctx.lastOpportunityId) {
    merged.opportunityId = ctx.lastOpportunityId;
  }
  if (!entityString(merged, 'opportunityName', 'opportunity_name') && ctx.lastOpportunityName) {
    merged.opportunityName = ctx.lastOpportunityName;
  }
  if (!entityString(merged, 'pipelineId', 'pipeline_id') && ctx.lastPipelineId) {
    merged.pipelineId = ctx.lastPipelineId;
  }
  if (!entityString(merged, 'pipelineName', 'pipeline_name') && ctx.lastPipelineName) {
    merged.pipelineName = ctx.lastPipelineName;
  }
  if (
    !entityString(merged, 'pipelineStageId', 'pipeline_stage_id', 'stageId') &&
    ctx.lastPipelineStageId
  ) {
    merged.pipelineStageId = ctx.lastPipelineStageId;
  }
  // Companies — only fill from session when the user didn't name a company
  // themselves. Same wrong-target safety as contacts: an explicit name in the
  // utterance ALWAYS wins over the session id.
  if (
    !entityString(merged, 'companyId', 'company_id') &&
    !entityString(merged, 'companyName', 'company_name', 'companyDomain', 'company_domain') &&
    ctx.lastCompanyId
  ) {
    merged.companyId = ctx.lastCompanyId;
  }
  if (
    !entityString(merged, 'companyName', 'company_name') &&
    !entityString(merged, 'companyDomain', 'company_domain') &&
    ctx.lastCompanyName
  ) {
    merged.companyName = ctx.lastCompanyName;
  }
  // Tickets — same wrong-target safety: only fill from session when the user
  // didn't name a ticket themselves.
  if (
    !entityString(merged, 'ticketId', 'ticket_id') &&
    !entityString(merged, 'ticketSubject', 'ticket_subject') &&
    ctx.lastTicketId
  ) {
    merged.ticketId = ctx.lastTicketId;
  }
  if (
    !entityString(merged, 'ticketSubject', 'ticket_subject') &&
    ctx.lastTicketSubject
  ) {
    merged.ticketSubject = ctx.lastTicketSubject;
  }
  // Products — same wrong-target safety: only fill from session when the user
  // didn't name a product themselves.
  if (
    !entityString(merged, 'productId', 'product_id') &&
    !entityString(merged, 'productName', 'product_name') &&
    ctx.lastProductId
  ) {
    merged.productId = ctx.lastProductId;
  }
  if (
    !entityString(merged, 'productName', 'product_name') &&
    ctx.lastProductName
  ) {
    merged.productName = ctx.lastProductName;
  }
  return merged;
}

export function shouldRunIntent(intent?: VoiceIntentPayload): boolean {
  if (!intent) return false;
  if (intent.intent === 'unknown') return false;
  const supported = new Set([
    'list_contacts',
    'find_contact',
    'create_contact',
    'update_contact',
    'delete_contact',
    'list_calendars',
    'get_calendar',
    'create_calendar',
    'update_calendar',
    'delete_calendar',
    'get_free_slots',
    'list_appointments',
    'create_appointment',
    'cancel_appointment',
    'list_pipelines',
    'list_opportunities',
    'find_opportunity',
    'create_opportunity',
    'update_opportunity',
    'update_opportunity_status',
    'delete_opportunity',
    'list_companies',
    'find_company',
    'create_company',
    'update_company',
    'delete_company',
    'attach_contact_to_company',
    'detach_contact_from_company',
    'attach_deal_to_company',
    'detach_deal_from_company',
    'list_tickets',
    'find_ticket',
    'create_ticket',
    'update_ticket',
    'delete_ticket',
    'attach_ticket_to_contact',
    'detach_ticket_from_contact',
    'attach_ticket_to_company',
    'detach_ticket_from_company',
    'attach_ticket_to_deal',
    'detach_ticket_from_deal',
    'list_products',
    'find_product',
    'create_product',
    'update_product',
    'delete_product',
  ]);
  return supported.has(intent.intent);
}

// ── HubSpot companies extractors ────────────────────────────────────────────
//
// All five helpers accept the raw LLM entities bag and produce a typed shape
// the HubspotCommandService can consume. They tolerate snake_case from the
// LLM, fall back to generic keys like `name` / `query`, and never throw on
// missing fields — the executor handles "missing required field" copy.

export type CompanyQuery = {
  id?: string;
  name?: string;
  domain?: string;
};

export function extractCompanyQuery(
  entities: Record<string, string | number | boolean | null>,
): CompanyQuery {
  return {
    id: entityString(entities, 'companyId', 'company_id'),
    name:
      entityString(entities, 'companyName', 'company_name') ||
      entityString(entities, 'query', 'name'),
    domain: entityString(entities, 'companyDomain', 'company_domain', 'domain', 'website'),
  };
}

export function extractCompanyCreateDetails(
  entities: Record<string, string | number | boolean | null>,
) {
  return {
    name:
      entityString(entities, 'companyName', 'company_name') ||
      entityString(entities, 'name') ||
      '',
    domain: entityString(entities, 'companyDomain', 'company_domain', 'domain'),
    phone: entityString(entities, 'companyPhone', 'company_phone', 'phone'),
    industry: entityString(entities, 'companyIndustry', 'company_industry', 'industry'),
    city: entityString(entities, 'companyCity', 'company_city', 'city'),
    state: entityString(entities, 'companyState', 'company_state', 'state'),
    country: entityString(entities, 'companyCountry', 'company_country', 'country'),
    numberOfEmployees: entityNumber(
      entities,
      'companyEmployees',
      'company_employees',
      'numberOfEmployees',
      'number_of_employees',
      'employees',
    ),
    description: entityString(
      entities,
      'companyDescription',
      'company_description',
      'description',
    ),
    website: entityString(entities, 'companyWebsite', 'company_website', 'website'),
  };
}

export function extractCompanyUpdateDetails(
  entities: Record<string, string | number | boolean | null>,
) {
  // Selector: how do we identify which company to update?
  const query: CompanyQuery = {
    id: entityString(entities, 'companyId', 'company_id'),
    // For update, "companyName" without "newCompanyName" means SELECTOR not
    // value — same convention as updateContact's `query` vs `newName`.
    name: entityString(entities, 'companyName', 'company_name', 'query'),
    domain: entityString(entities, 'companyDomain', 'company_domain'),
  };

  return {
    query,
    newName: entityString(entities, 'newCompanyName', 'new_company_name', 'newName'),
    domain: entityString(entities, 'newCompanyDomain', 'new_company_domain'),
    phone: entityString(entities, 'newCompanyPhone', 'new_company_phone', 'companyPhone', 'phone'),
    industry: entityString(
      entities,
      'newCompanyIndustry',
      'new_company_industry',
      'companyIndustry',
      'industry',
    ),
    city: entityString(entities, 'newCompanyCity', 'new_company_city', 'companyCity', 'city'),
    state: entityString(entities, 'newCompanyState', 'new_company_state', 'companyState', 'state'),
    country: entityString(
      entities,
      'newCompanyCountry',
      'new_company_country',
      'companyCountry',
      'country',
    ),
    numberOfEmployees: entityNumber(
      entities,
      'newCompanyEmployees',
      'new_company_employees',
      'companyEmployees',
      'numberOfEmployees',
      'employees',
    ),
    description: entityString(
      entities,
      'newCompanyDescription',
      'new_company_description',
      'companyDescription',
      'description',
    ),
    website: entityString(
      entities,
      'newCompanyWebsite',
      'new_company_website',
      'companyWebsite',
      'website',
    ),
  };
}

export function extractCompanyContactAssociation(
  entities: Record<string, string | number | boolean | null>,
) {
  return {
    company: extractCompanyQuery(entities),
    contact: {
      id: entityString(entities, 'contactId', 'contact_id'),
      query:
        entityString(entities, 'contactName', 'contact_name') ||
        buildNameFromEntities(entities) ||
        entityString(entities, 'contactEmail', 'contact_email', 'email') ||
        entityString(entities, 'contactPhone', 'contact_phone', 'phone') ||
        '',
    },
  };
}

export function extractCompanyDealAssociation(
  entities: Record<string, string | number | boolean | null>,
) {
  return {
    company: extractCompanyQuery(entities),
    deal: {
      id: entityString(entities, 'dealId', 'deal_id', 'opportunityId', 'opportunity_id'),
      name:
        entityString(entities, 'dealName', 'deal_name', 'opportunityName', 'opportunity_name') ||
        '',
    },
  };
}

// ── HubSpot tickets extractors ──────────────────────────────────────────────
//
// Same conventions as the companies extractors: tolerate snake_case, fall back
// to generic keys like `subject` / `query`, never throw on missing fields.

export type TicketQuery = {
  id?: string;
  subject?: string;
};

export function extractTicketQuery(
  entities: Record<string, string | number | boolean | null>,
): TicketQuery {
  return {
    id: entityString(entities, 'ticketId', 'ticket_id'),
    subject:
      entityString(entities, 'ticketSubject', 'ticket_subject') ||
      entityString(entities, 'query', 'subject', 'name'),
  };
}

export function extractTicketCreateDetails(
  entities: Record<string, string | number | boolean | null>,
) {
  return {
    subject:
      entityString(entities, 'ticketSubject', 'ticket_subject') ||
      entityString(entities, 'subject', 'name', 'title') ||
      '',
    content: entityString(
      entities,
      'ticketContent',
      'ticket_content',
      'content',
      'description',
      'body',
    ),
    priority: entityString(entities, 'ticketPriority', 'ticket_priority', 'priority'),
    pipeline: entityString(entities, 'ticketPipeline', 'ticket_pipeline', 'pipeline'),
    stage: entityString(entities, 'ticketStage', 'ticket_stage', 'stage'),
  };
}

export function extractTicketUpdateDetails(
  entities: Record<string, string | number | boolean | null>,
) {
  // Selector: how do we identify which ticket to update? A bare "ticketSubject"
  // (without "newTicketSubject") means SELECTOR, not the new value — same
  // convention as updateCompany's `query` vs `newName`.
  const query: TicketQuery = {
    id: entityString(entities, 'ticketId', 'ticket_id'),
    subject: entityString(entities, 'ticketSubject', 'ticket_subject', 'query'),
  };

  return {
    query,
    subject: entityString(entities, 'newTicketSubject', 'new_ticket_subject', 'newSubject'),
    content: entityString(
      entities,
      'newTicketContent',
      'new_ticket_content',
      'ticketContent',
      'content',
      'description',
    ),
    priority: entityString(
      entities,
      'newTicketPriority',
      'new_ticket_priority',
      'ticketPriority',
      'priority',
    ),
    pipeline: entityString(entities, 'newTicketPipeline', 'ticketPipeline', 'pipeline'),
    stage: entityString(
      entities,
      'newTicketStage',
      'new_ticket_stage',
      'ticketStage',
      'stage',
    ),
  };
}

export function extractTicketContactAssociation(
  entities: Record<string, string | number | boolean | null>,
) {
  return {
    ticket: extractTicketQuery(entities),
    contact: {
      id: entityString(entities, 'contactId', 'contact_id'),
      query:
        entityString(entities, 'contactName', 'contact_name') ||
        buildNameFromEntities(entities) ||
        entityString(entities, 'contactEmail', 'contact_email', 'email') ||
        entityString(entities, 'contactPhone', 'contact_phone', 'phone') ||
        '',
    },
  };
}

export function extractTicketCompanyAssociation(
  entities: Record<string, string | number | boolean | null>,
) {
  return {
    ticket: extractTicketQuery(entities),
    company: extractCompanyQuery(entities),
  };
}

export function extractTicketDealAssociation(
  entities: Record<string, string | number | boolean | null>,
) {
  return {
    ticket: extractTicketQuery(entities),
    deal: {
      id: entityString(entities, 'dealId', 'deal_id', 'opportunityId', 'opportunity_id'),
      name:
        entityString(entities, 'dealName', 'deal_name', 'opportunityName', 'opportunity_name') ||
        '',
    },
  };
}

// ── HubSpot products extractors ─────────────────────────────────────────────
//
// Products are a HubSpot library object (CRUD + search, no associations). The
// helpers tolerate snake_case from the LLM, fall back to generic keys like
// `name` / `query` / `sku`, and never throw on missing fields.

export type ProductQuery = {
  id?: string;
  name?: string;
};

export function extractProductQuery(
  entities: Record<string, string | number | boolean | null>,
): ProductQuery {
  return {
    id: entityString(entities, 'productId', 'product_id'),
    name:
      entityString(entities, 'productName', 'product_name') ||
      entityString(entities, 'query', 'name', 'sku'),
  };
}

export function extractProductCreateDetails(
  entities: Record<string, string | number | boolean | null>,
) {
  return {
    name:
      entityString(entities, 'productName', 'product_name') ||
      entityString(entities, 'name', 'title') ||
      '',
    price: entityNumber(entities, 'productPrice', 'product_price', 'price', 'amount'),
    sku: entityString(entities, 'productSku', 'product_sku', 'sku'),
    description: entityString(
      entities,
      'productDescription',
      'product_description',
      'description',
      'body',
    ),
    cost: entityNumber(entities, 'productCost', 'product_cost', 'cost'),
  };
}

export function extractProductUpdateDetails(
  entities: Record<string, string | number | boolean | null>,
) {
  // Selector: a bare "productName" (without "newProductName") identifies WHICH
  // product to update, not the new value — same convention as updateTicket.
  const query: ProductQuery = {
    id: entityString(entities, 'productId', 'product_id'),
    name: entityString(entities, 'productName', 'product_name', 'query'),
  };

  return {
    query,
    name: entityString(entities, 'newProductName', 'new_product_name', 'newName'),
    price: entityNumber(
      entities,
      'newProductPrice',
      'new_product_price',
      'newPrice',
      'price',
      'amount',
    ),
    sku: entityString(entities, 'newProductSku', 'new_product_sku', 'productSku', 'sku'),
    description: entityString(
      entities,
      'newProductDescription',
      'new_product_description',
      'productDescription',
      'description',
    ),
    cost: entityNumber(entities, 'newProductCost', 'new_product_cost', 'productCost', 'cost'),
  };
}
