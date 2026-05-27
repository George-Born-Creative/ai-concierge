import type { VoiceIntentPayload } from './assistant.types';

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
  ]);
  return supported.has(intent.intent);
}
