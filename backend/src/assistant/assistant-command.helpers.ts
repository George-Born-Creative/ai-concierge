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
    email: entityString(entities, 'email')?.toLowerCase(),
  };
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
  return merged;
}

export function shouldRunIntent(intent?: VoiceIntentPayload): boolean {
  if (!intent) return false;
  if (intent.intent === 'unknown') return false;
  const supported = new Set([
    'list_contacts',
    'find_contact',
    'create_contact',
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
  ]);
  return supported.has(intent.intent);
}
