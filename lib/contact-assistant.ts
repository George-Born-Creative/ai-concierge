import { ghlApi, voiceApi } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import type { GhlContactSummary, VoiceIntent } from '@/lib/api/types';

export type AssistantCommandStatus = 'success' | 'error';

export type AssistantCommandResult = {
  response: string;
  status: AssistantCommandStatus;
};

const CONTACT_INTENTS = new Set([
  'list_contacts',
  'find_contact',
  'create_contact',
  'delete_contact',
]);

export async function executeContactCommand(
  command: string,
  intent?: VoiceIntent,
): Promise<AssistantCommandResult> {
  const normalized = command.trim();

  if (!normalized) {
    return {
      response: 'Tell me what you want to do with your contacts.',
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
  return CONTACT_INTENTS.has(intent.intent);
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
    default:
      return null;
  }
}

async function executeWithHeuristics(command: string): Promise<AssistantCommandResult> {
  const lower = command.toLowerCase();

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
      'I can list, look up, add, or remove contacts in GoHighLevel. Try something like "pull up my contacts" or "add Sarah 555-123-4567".',
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
  'create',
  'add contact',
  'add',
  'new contact',
  'save contact',
  'save',
  'put in',
  'register',
];

function looksLikeList(command: string) {
  return (
    /\b(contacts?|people|leads|clients)\b/.test(command) &&
    /\b(list|show|pull up|get|see|recent|latest|my|all|who)\b/.test(command) &&
    !/\b(add|create|delete|remove|find|look)\b/.test(command)
  );
}

function looksLikeCreate(command: string) {
  return CREATE_LEADS.some((lead) => command.includes(lead));
}

function looksLikeDelete(command: string) {
  return DELETE_LEADS.some((lead) => command.includes(lead));
}

function looksLikeFind(command: string) {
  return FIND_LEADS.some((lead) => command.includes(lead));
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

function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}@]+/gu, '');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ghlErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'Hook up GoHighLevel in Profile first, then I can work with your contacts.';
    }
    return error.message;
  }
  return error instanceof Error
    ? error.message
    : 'Something went wrong while working with your contacts.';
}
