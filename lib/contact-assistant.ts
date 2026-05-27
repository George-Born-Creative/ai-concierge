import { ghlApi, voiceApi } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import type { GhlAppointmentSummary, GhlContactSummary, VoiceIntent } from '@/lib/api/types';

export type AssistantCommandStatus = 'success' | 'error';

export type AssistantCommandResult = {
  response: string;
  status: AssistantCommandStatus;
};

const ASSISTANT_INTENTS = new Set([
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

export async function executeContactCommand(
  command: string,
  intent?: VoiceIntent,
): Promise<AssistantCommandResult> {
  const normalized = command.trim();

  if (!normalized) {
    return {
      response: 'Tell me what you want to do with contacts or your calendar.',
      status: 'error',
    };
  }

  try {
    let resolved = intent;

    if (!shouldRunIntent(resolved)) {
      try {
        resolved = await voiceApi.interpret(normalized);
      } catch {
        // Fall back to local phrase matching if interpret fails (e.g. no OpenAI key).
      }
    }

    if (resolved?.needs_clarification && resolved.notes) {
      return { response: resolved.notes, status: 'error' };
    }

    if (resolved && shouldRunIntent(resolved)) {
      const fromIntent = await executeFromIntent(resolved);
      if (fromIntent) return fromIntent;
    }

    return executeWithHeuristics(normalized);
  } catch (error) {
    return {
      response: ghlErrorMessage(error),
      status: 'error',
    };
  }
}

function shouldRunIntent(intent?: VoiceIntent): boolean {
  if (!intent) return false;
  if (intent.intent === 'unknown') return false;
  return ASSISTANT_INTENTS.has(intent.intent);
}

async function executeFromIntent(
  intent: VoiceIntent,
): Promise<AssistantCommandResult | null> {
  switch (intent.intent) {
    case 'list_contacts':
      return listLatestContacts();
    case 'find_contact':
      return findContactByQuery(extractSearchQuery(intent.entities));
    case 'create_contact':
      return createContactFromDetails(extractCreateDetails(intent.entities));
    case 'delete_contact':
      return deleteContactByQuery(extractSearchQuery(intent.entities));
    case 'list_calendars':
      return listCalendars();
    case 'get_calendar':
      return getCalendarByQuery(extractCalendarQuery(intent.entities));
    case 'create_calendar':
      return createCalendarFromDetails(extractCalendarCreateDetails(intent.entities));
    case 'update_calendar':
      return updateCalendarFromDetails(extractCalendarUpdateDetails(intent.entities));
    case 'delete_calendar':
      return deleteCalendarByQuery(extractCalendarQuery(intent.entities));
    case 'get_free_slots':
      return getFreeSlotsFromDetails(extractFreeSlotsDetails(intent.entities));
    case 'list_appointments':
      return listUpcomingAppointments(extractAppointmentRange(intent.entities));
    case 'create_appointment':
      return createAppointmentFromDetails(extractAppointmentDetails(intent.entities));
    case 'cancel_appointment':
      return cancelAppointmentByQuery(extractAppointmentCancelQuery(intent.entities));
    default:
      return null;
  }
}

async function executeWithHeuristics(command: string): Promise<AssistantCommandResult> {
  const lower = command.toLowerCase();

  if (looksLikeListCalendars(lower)) {
    return listCalendars();
  }
  if (looksLikeFreeSlots(lower)) {
    return {
      response: 'Which calendar, and what date range? Try "free slots tomorrow on my main calendar".',
      status: 'error',
    };
  }
  if (looksLikeListAppointments(lower)) {
    return listUpcomingAppointments();
  }
  if (looksLikeBookAppointment(lower)) {
    return {
      response: 'Who should I book it with, and when? Something like "book Sarah tomorrow at 2pm".',
      status: 'error',
    };
  }
  if (looksLikeCancelAppointment(lower)) {
    return cancelAppointmentByQuery(stripLeadPhrases(command, CANCEL_APPOINTMENT_LEADS));
  }
  if (looksLikeList(lower)) {
    return listLatestContacts();
  }
  if (looksLikeCreate(lower)) {
    return createContactFromDetails(parseCreateFromText(command));
  }
  if (looksLikeDelete(lower)) {
    return deleteContactByQuery(stripLeadPhrases(command, DELETE_LEADS));
  }
  if (looksLikeFind(lower)) {
    return findContactByQuery(stripLeadPhrases(command, FIND_LEADS));
  }

  return {
    response:
      'I can handle contacts and calendars in GoHighLevel. Try "pull up my contacts", "what\'s on my calendar", or "book Sarah tomorrow at 2pm".',
    status: 'error',
  };
}

const FIND_LEADS = [
  'look up',
  'look for',
  'search for',
  'search',
  'find contact',
  'find',
  'fetch',
  'identify',
  'who is',
  'who\'s',
  'whos',
  'got anyone',
  'anyone named',
  'anybody named',
  'do we have',
  'do i have',
  'get contact',
];

const DELETE_LEADS = [
  'delete contact',
  'delete',
  'remove contact',
  'remove',
  'get rid of',
  'drop',
  'erase',
];

const CREATE_LEADS = [
  'create contact',
  'add contact',
  'new contact',
  'save contact',
  'put in',
  'register',
];

const CANCEL_APPOINTMENT_LEADS = [
  'cancel appointment',
  'cancel meeting',
  'cancel the meeting',
  'cancel the appointment',
  'remove appointment',
  'remove meeting',
  'delete appointment',
  'delete meeting',
  'cancel',
];

function looksLikeListCalendars(command: string) {
  return /\bcalendar(s)?\b/.test(command) && /\b(list|show|what|my|which|got)\b/.test(command);
}

function looksLikeListAppointments(command: string) {
  return (
    /\b(appointment|meeting|schedule|calendar)\b/.test(command) &&
    /\b(upcoming|today|tomorrow|this week|on my|what's|whats|show|list|any)\b/.test(command)
  );
}

function looksLikeBookAppointment(command: string) {
  return (
    /\b(book|schedule|set up|setup|arrange|plan)\b/.test(command) &&
    /\b(appointment|meeting|call|calendar)\b/.test(command)
  );
}

function looksLikeCancelAppointment(command: string) {
  return CANCEL_APPOINTMENT_LEADS.some((lead) => command.includes(lead)) &&
    /\b(appointment|meeting|calendar|with)\b/.test(command);
}

function looksLikeList(command: string) {
  return (
    /\b(contacts?|people|leads|clients)\b/.test(command) &&
    /\b(list|show|pull up|get|see|recent|latest|my|all|who)\b/.test(command) &&
    !/\b(add|create|delete|remove|find|look)\b/.test(command)
  );
}

function looksLikeCreate(command: string) {
  if (looksLikeBookAppointment(command)) return false;
  return CREATE_LEADS.some((lead) => command.includes(lead)) || command.startsWith('add ');
}

function looksLikeDelete(command: string) {
  if (looksLikeCancelAppointment(command)) return false;
  return DELETE_LEADS.some((lead) => command.includes(lead));
}

function looksLikeFind(command: string) {
  return FIND_LEADS.some((lead) => command.includes(lead));
}

async function resolveCalendarId(calendarId?: string, calendarName?: string) {
  if (calendarId?.trim()) return calendarId.trim();

  const calendars = await ghlApi.listCalendars();
  if (calendars.calendars.length === 0) {
    throw new Error('No calendars found in GoHighLevel');
  }

  const query = calendarName?.trim().toLowerCase();
  if (query) {
    const match = calendars.calendars.find((calendar) =>
      calendar.name.toLowerCase().includes(query),
    );
    if (match) return match.id;
    throw new Error(`No calendar matching "${calendarName}"`);
  }

  return calendars.calendars[0].id;
}

async function listCalendars(): Promise<AssistantCommandResult> {
  const result = await ghlApi.listCalendars();

  if (result.calendars.length === 0) {
    return {
      response: "You don't have any calendars set up in GoHighLevel yet.",
      status: 'success',
    };
  }

  return {
    response: `Here are your calendars:\n${result.calendars.map(formatCalendar).join('\n')}`,
    status: 'success',
  };
}

async function getCalendarByQuery(query: string): Promise<AssistantCommandResult> {
  if (!query.trim()) {
    return {
      response: 'Which calendar? Give me a name or ID.',
      status: 'error',
    };
  }

  const calendarId = await resolveCalendarId(undefined, query);
  const calendar = await ghlApi.getCalendar(calendarId);

  return {
    response: `Calendar: ${calendar.name}${calendar.isActive === false ? ' (inactive)' : ''} (id ${calendar.id})`,
    status: 'success',
  };
}

async function createCalendarFromDetails(
  details: ReturnType<typeof extractCalendarCreateDetails>,
): Promise<AssistantCommandResult> {
  if (!details.name) {
    return {
      response: 'What should I name the new calendar?',
      status: 'error',
    };
  }

  const created = await ghlApi.createCalendar({
    name: details.name,
    description: details.description,
    isActive: details.isActive,
  });

  return {
    response: `Created calendar "${created.name}" (id ${created.id}).`,
    status: 'success',
  };
}

async function updateCalendarFromDetails(
  details: ReturnType<typeof extractCalendarUpdateDetails>,
): Promise<AssistantCommandResult> {
  if (!details.calendarId && !details.calendarName) {
    return {
      response: 'Which calendar should I update?',
      status: 'error',
    };
  }

  const calendarId = await resolveCalendarId(details.calendarId, details.calendarName);
  const updated = await ghlApi.updateCalendar(calendarId, {
    name: details.name,
    description: details.description,
    isActive: details.isActive,
  });

  return {
    response: `Updated calendar "${updated.name}".`,
    status: 'success',
  };
}

async function deleteCalendarByQuery(query: string): Promise<AssistantCommandResult> {
  if (!query.trim()) {
    return {
      response: 'Which calendar should I delete?',
      status: 'error',
    };
  }

  const calendarId = await resolveCalendarId(undefined, query);
  const calendar = await ghlApi.getCalendar(calendarId);
  await ghlApi.deleteCalendar(calendarId);

  return {
    response: `Deleted calendar "${calendar.name}".`,
    status: 'success',
  };
}

async function getFreeSlotsFromDetails(
  details: ReturnType<typeof extractFreeSlotsDetails>,
): Promise<AssistantCommandResult> {
  const calendarId = await resolveCalendarId(details.calendarId, details.calendarName);
  const startDate = details.startDate ?? Date.now();
  const endDate = details.endDate ?? startDate + (details.days ?? 7) * 24 * 60 * 60 * 1000;

  const slots = await ghlApi.getCalendarFreeSlots(calendarId, {
    startDate,
    endDate,
    timezone: details.timezone,
    userId: details.userId,
  });

  const summary = formatFreeSlots(slots);
  if (!summary) {
    return {
      response: 'No free slots in that range.',
      status: 'success',
    };
  }

  return {
    response: `Available slots:\n${summary}`,
    status: 'success',
  };
}

async function listUpcomingAppointments(
  range?: ReturnType<typeof extractAppointmentRange>,
): Promise<AssistantCommandResult> {
  const result = await ghlApi.listCalendarEvents({
    startTime: range?.startTime,
    endTime: range?.endTime,
    days: range?.days ?? 14,
  });

  if (result.appointments.length === 0) {
    return {
      response: 'Nothing on the calendar for that window.',
      status: 'success',
    };
  }

  return {
    response: `Here's what's coming up:\n${result.appointments
      .slice(0, 10)
      .map(formatAppointment)
      .join('\n')}`,
    status: 'success',
  };
}

async function createAppointmentFromDetails(
  details: ReturnType<typeof extractAppointmentDetails>,
): Promise<AssistantCommandResult> {
  if (!details.startTime) {
    return {
      response: 'When should it be? Give me a day and time, like "tomorrow at 2pm".',
      status: 'error',
    };
  }
  if (!details.contactName && !details.contactId) {
    return {
      response: 'Who is the appointment with?',
      status: 'error',
    };
  }

  const created = await ghlApi.createAppointment({
    contactId: details.contactId,
    contactName: details.contactName,
    calendarId: details.calendarId,
    calendarName: details.calendarName,
    startTime: details.startTime,
    endTime: details.endTime,
    durationMinutes: details.durationMinutes,
    title: details.title,
    notes: details.notes,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  return {
    response: `Booked — ${created.title} ${formatWhen(created.startTime)}.`,
    status: 'success',
  };
}

async function cancelAppointmentByQuery(query: string): Promise<AssistantCommandResult> {
  if (!query.trim()) {
    return {
      response: 'Which appointment should I cancel? A name or time helps.',
      status: 'error',
    };
  }

  const result = await ghlApi.listCalendarEvents({ days: 30 });
  const matches = findMatchingAppointments(result.appointments, query);

  if (matches.length === 0) {
    return {
      response: `Couldn't find an appointment matching "${query}".`,
      status: 'error',
    };
  }

  await ghlApi.cancelAppointment(matches[0].id);

  return {
    response: `Canceled ${matches[0].title} ${formatWhen(matches[0].startTime)}.`,
    status: 'success',
  };
}

async function listLatestContacts(): Promise<AssistantCommandResult> {
  const result = await ghlApi.listContacts({ limit: 10 });
  const summaries = result.contacts.filter((contact) => contact.name !== 'Unknown');

  if (summaries.length === 0) {
    return {
      response: "You don't have any contacts in GoHighLevel yet.",
      status: 'success',
    };
  }

  return {
    response: `Here's who you've got recently:\n${summaries.map(formatContact).join('\n')}`,
    status: 'success',
  };
}

async function createContactFromDetails(
  details: ReturnType<typeof parseCreateFromText>,
): Promise<AssistantCommandResult> {
  if (!details.name || (!details.phone && !details.email)) {
    return {
      response: 'I need a name and either a phone number or email. Something like "add Sarah 555-123-4567".',
      status: 'error',
    };
  }

  const { firstName, lastName } = splitName(details.name);
  const created = await ghlApi.createContact({
    name: details.name,
    firstName,
    lastName,
    phone: details.phone,
    email: details.email,
  });

  const bits = [
    created.phone ? `phone ${created.phone}` : null,
    created.email ? `email ${created.email}` : null,
  ].filter(Boolean);

  return {
    response: `Done — added ${created.name}${bits.length ? ` (${bits.join(', ')})` : ''}.`,
    status: 'success',
  };
}

async function deleteContactByQuery(query: string): Promise<AssistantCommandResult> {
  if (!query) {
    return {
      response: 'Who should I remove? Give me a name or number.',
      status: 'error',
    };
  }

  const matches = await findMatchingContacts(query);

  if (matches.length === 0) {
    return {
      response: `Couldn't find anyone matching "${query}".`,
      status: 'error',
    };
  }

  await ghlApi.deleteContact(matches[0].id);

  return {
    response: `Removed ${matches[0].name}.`,
    status: 'success',
  };
}

async function findContactByQuery(query: string): Promise<AssistantCommandResult> {
  if (!query) {
    return {
      response: 'Who are you looking for? A name, phone, or email works.',
      status: 'error',
    };
  }

  const matches = await findMatchingContacts(query);

  if (matches.length === 0) {
    return {
      response: `No one in GoHighLevel matches "${query}".`,
      status: 'error',
    };
  }

  return {
    response:
      matches.length === 1
        ? `Found them:\n${formatContact(matches[0])}`
        : `Found ${matches.length} people:\n${matches
            .slice(0, 5)
            .map(formatContact)
            .join('\n')}`,
    status: 'success',
  };
}

async function findMatchingContacts(query: string) {
  const result = await ghlApi.listContacts({ limit: 20, query });
  const searchableQuery = normalizeSearch(query);

  return result.contacts.filter((contact) => {
    const searchableContact = normalizeSearch(
      [contact.name, contact.phone, contact.email].filter(Boolean).join(' '),
    );
    return searchableContact.includes(searchableQuery);
  });
}

function extractSearchQuery(entities: VoiceIntent['entities']): string {
  const query = entityString(entities, 'query');
  if (query) return query;

  const name = buildNameFromEntities(entities);
  if (name) return name;

  return entityString(entities, 'phone', 'email') ?? '';
}

function extractCalendarQuery(entities: VoiceIntent['entities']) {
  return (
    entityString(entities, 'query', 'calendarName', 'calendarId', 'name') ?? ''
  );
}

function extractCalendarCreateDetails(entities: VoiceIntent['entities']) {
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

function extractCalendarUpdateDetails(entities: VoiceIntent['entities']) {
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

function extractFreeSlotsDetails(entities: VoiceIntent['entities']) {
  const days = entityNumber(entities, 'days');
  const startDate = entityNumber(entities, 'startDate', 'start_date');
  const endDate = entityNumber(entities, 'endDate', 'end_date');
  return {
    calendarId: entityString(entities, 'calendarId', 'calendar_id'),
    calendarName: entityString(entities, 'calendarName', 'calendar_name', 'name'),
    startDate,
    endDate,
    days,
    timezone: entityString(entities, 'timezone', 'timeZone'),
    userId: entityString(entities, 'userId', 'user_id'),
  };
}

function formatFreeSlots(payload: Record<string, unknown>): string {
  const lines: string[] = [];

  const dated = payload as Record<string, { slots?: { start?: string; end?: string }[] }>;
  for (const [day, value] of Object.entries(dated)) {
    if (day === 'traceId') continue;
    const daySlots = value?.slots ?? [];
    if (!Array.isArray(daySlots) || daySlots.length === 0) continue;
    const times = daySlots
      .slice(0, 8)
      .map((slot) => {
        const start = slot.start ? formatWhen(slot.start) : '';
        return start || 'slot';
      })
      .join(', ');
    lines.push(`· ${day}: ${times}`);
    if (lines.length >= 7) break;
  }

  return lines.join('\n');
}

function looksLikeFreeSlots(command: string) {
  return (
    /\b(free slot|available slot|open slot|availability)\b/.test(command) ||
    (/\b(slot|slots)\b/.test(command) && /\b(free|available|open)\b/.test(command))
  );
}

function extractAppointmentRange(entities: VoiceIntent['entities']) {
  const days = entityNumber(entities, 'days');
  return {
    startTime: entityString(entities, 'startTime', 'start_time'),
    endTime: entityString(entities, 'endTime', 'end_time'),
    days: days ?? undefined,
  };
}

function extractAppointmentDetails(entities: VoiceIntent['entities']) {
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

function extractAppointmentCancelQuery(entities: VoiceIntent['entities']) {
  return (
    entityString(entities, 'query') ||
    entityString(entities, 'contactName', 'contact_name') ||
    buildNameFromEntities(entities) ||
    entityString(entities, 'title') ||
    entityString(entities, 'startTime', 'start_time') ||
    ''
  );
}

function findMatchingAppointments(appointments: GhlAppointmentSummary[], query: string) {
  const searchableQuery = normalizeSearch(query);
  return appointments.filter((appointment) => {
    const haystack = normalizeSearch(
      [appointment.title, appointment.startTime, appointment.endTime].filter(Boolean).join(' '),
    );
    return haystack.includes(searchableQuery);
  });
}

function extractCreateDetails(entities: VoiceIntent['entities']) {
  const email = entityString(entities, 'email')?.toLowerCase();
  const phone = entityString(entities, 'phone');
  const name =
    entityString(entities, 'name') || buildNameFromEntities(entities) || '';

  return { name, phone, email };
}

function parseCreateFromText(command: string) {
  const target = stripLeadPhrases(command, CREATE_LEADS);
  const email = target.match(/[^\s]+@[^\s]+\.[^\s]+/)?.[0]?.toLowerCase();
  const phone = target.match(/[+()\d][+()\d\s.-]{5,}/)?.[0]?.trim();
  const name = target
    .replace(email ?? '', '')
    .replace(phone ?? '', '')
    .replace(/\b(with|phone|email|number|named|called)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { email, name, phone };
}

function buildNameFromEntities(entities: VoiceIntent['entities']) {
  const direct = entityString(entities, 'name');
  if (direct) return direct;

  const first = entityString(entities, 'firstName', 'first_name');
  const last = entityString(entities, 'lastName', 'last_name');
  return [first, last].filter(Boolean).join(' ');
}

function entityString(
  entities: VoiceIntent['entities'],
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

function entityNumber(
  entities: VoiceIntent['entities'],
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

function stripLeadPhrases(command: string, leads: string[]) {
  let target = command.trim();
  const sorted = [...leads].sort((a, b) => b.length - a.length);

  for (const lead of sorted) {
    const expression = new RegExp(`^${escapeRegExp(lead)}\\s*`, 'i');
    target = target.replace(expression, '');
  }

  return target.replace(/^(the|a|an|contact|person)\s+/i, '').replace(/\s+/g, ' ').trim();
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: undefined };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function formatContact(contact: GhlContactSummary) {
  const detail = [contact.phone, contact.email].filter(Boolean).join(' · ');
  return detail ? `· ${contact.name} — ${detail}` : `· ${contact.name}`;
}

function formatCalendar(calendar: { name: string; isActive?: boolean }) {
  return calendar.isActive === false ? `· ${calendar.name} (inactive)` : `· ${calendar.name}`;
}

function formatAppointment(appointment: GhlAppointmentSummary) {
  const when = formatWhen(appointment.startTime);
  return when ? `· ${appointment.title} — ${when}` : `· ${appointment.title}`;
}

function formatWhen(iso?: string) {
  if (iso == null || iso === '') return '';

  const raw = String(iso).trim();
  const wall = parseIsoWallClock(raw);
  if (wall) {
    return formatWallClock(wall);
  }

  const epochMs = parseEpochMs(raw);
  if (epochMs != null) {
    return new Date(epochMs).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  const time = Date.parse(raw);
  if (Number.isNaN(time)) return raw;
  return new Date(time).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Show the wall-clock from GHL ISO (offset preserved), not a second device conversion. */
function parseIsoWallClock(value: string) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/i,
  );
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
}

function formatWallClock(parts: { year: number; month: number; day: number; hour: number; minute: number }) {
  const date = new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function parseEpochMs(value: string): number | null {
  if (!/^\d{10,13}$/.test(value)) return null;
  const n = Number(value);
  return value.length <= 10 ? n * 1000 : n;
}

function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}@]+/gu, '');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ghlErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      if (/calendar access|calendar scopes/i.test(error.message)) {
        return error.message;
      }
      return 'Hook up GoHighLevel in Profile first, then I can work with your contacts and calendar.';
    }
    return error.message;
  }
  return error instanceof Error
    ? error.message
    : 'Something went wrong while working with GoHighLevel.';
}
