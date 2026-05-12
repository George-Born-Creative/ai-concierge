import * as Contacts from 'expo-contacts';

export type AssistantCommandStatus = 'success' | 'error';

export type AssistantCommandResult = {
  response: string;
  status: AssistantCommandStatus;
};

type ContactSummary = {
  id?: string;
  name: string;
  phone?: string;
  email?: string;
};

const CONTACT_FIELDS = [
  Contacts.Fields.FirstName,
  Contacts.Fields.LastName,
  Contacts.Fields.Name,
  Contacts.Fields.PhoneNumbers,
  Contacts.Fields.Emails,
];

export async function executeContactCommand(command: string): Promise<AssistantCommandResult> {
  const normalized = command.trim();

  if (!normalized) {
    return {
      response: 'Say or type a contact command to get started.',
      status: 'error',
    };
  }

  const permission = await Contacts.requestPermissionsAsync();

  if (permission.status !== 'granted') {
    return {
      response: 'I need contacts permission before I can fetch, create, identify, or delete contacts.',
      status: 'error',
    };
  }

  const lowerCommand = normalized.toLowerCase();

  try {
    if (isLatestContactsCommand(lowerCommand)) {
      return listLatestContacts();
    }

    if (isCreateContactCommand(lowerCommand)) {
      return createContact(normalized);
    }

    if (isDeleteContactCommand(lowerCommand)) {
      return deleteContact(normalized);
    }

    if (isFindContactCommand(lowerCommand)) {
      return findContact(normalized);
    }

    return {
      response:
        'I can handle contacts for now. Try: "list latest contacts", "find Sarah", "create contact Sarah 5551234567", or "delete contact Sarah".',
      status: 'error',
    };
  } catch (error) {
    return {
      response: error instanceof Error ? error.message : 'Something went wrong while working with contacts.',
      status: 'error',
    };
  }
}

function isLatestContactsCommand(command: string) {
  return (
    command.includes('latest contact') ||
    command.includes('recent contact') ||
    command.includes('list contact') ||
    command.includes('show contact') ||
    command === 'contacts'
  );
}

function isCreateContactCommand(command: string) {
  return command.includes('create contact') || command.includes('add contact') || command.startsWith('save ');
}

function isDeleteContactCommand(command: string) {
  return command.includes('delete contact') || command.includes('remove contact');
}

function isFindContactCommand(command: string) {
  return (
    command.includes('find ') ||
    command.includes('fetch ') ||
    command.includes('identify ') ||
    command.includes('who is ') ||
    command.includes('get contact')
  );
}

async function listLatestContacts(): Promise<AssistantCommandResult> {
  const contacts = await loadContacts(10);
  const summaries = contacts.map(toContactSummary).filter((contact) => contact.name !== 'Unknown');

  if (summaries.length === 0) {
    return {
      response: 'I could not find any contacts yet.',
      status: 'success',
    };
  }

  return {
    response: `Here are the latest contacts:\n${summaries.map(formatContact).join('\n')}`,
    status: 'success',
  };
}

async function createContact(command: string): Promise<AssistantCommandResult> {
  const details = parseCreateCommand(command);

  if (!details.name || (!details.phone && !details.email)) {
    return {
      response: 'Please include a name and phone or email. Example: "create contact Sarah Parker 5551234567".',
      status: 'error',
    };
  }

  const contactId = await Contacts.addContactAsync({
    contactType: Contacts.ContactTypes.Person,
    name: details.name,
    firstName: details.name,
    phoneNumbers: details.phone
      ? [
          {
            label: 'mobile',
            number: details.phone,
          },
        ]
      : undefined,
    emails: details.email
      ? [
          {
            label: 'work',
            email: details.email,
          },
        ]
      : undefined,
  });

  return {
    response: `Created ${details.name}${details.phone ? ` with ${details.phone}` : ''}${
      details.email ? ` and ${details.email}` : ''
    }. Contact id: ${contactId}.`,
    status: 'success',
  };
}

async function deleteContact(command: string): Promise<AssistantCommandResult> {
  const query = cleanCommandTarget(command, ['delete contact', 'remove contact']);

  if (!query) {
    return {
      response: 'Tell me which contact to delete. Example: "delete contact Sarah Parker".',
      status: 'error',
    };
  }

  const matches = await findMatchingContacts(query);

  if (matches.length === 0 || !matches[0].id) {
    return {
      response: `I could not find a contact matching "${query}".`,
      status: 'error',
    };
  }

  await Contacts.removeContactAsync(matches[0].id);

  return {
    response: `Deleted ${matches[0].name}.`,
    status: 'success',
  };
}

async function findContact(command: string): Promise<AssistantCommandResult> {
  const query = cleanCommandTarget(command, [
    'find contact',
    'find',
    'fetch user contact',
    'fetch contact',
    'fetch',
    'identify the person with',
    'identify person with',
    'identify',
    'who is',
    'get contact',
  ]);

  if (!query) {
    return {
      response: 'Tell me a name, phone, or email to identify. Example: "identify 5551234567".',
      status: 'error',
    };
  }

  const matches = await findMatchingContacts(query);

  if (matches.length === 0) {
    return {
      response: `I could not identify anyone matching "${query}".`,
      status: 'error',
    };
  }

  return {
    response: `I found ${matches.length} matching contact${matches.length > 1 ? 's' : ''}:\n${matches
      .slice(0, 5)
      .map(formatContact)
      .join('\n')}`,
    status: 'success',
  };
}

async function findMatchingContacts(query: string) {
  const contacts = await loadContacts(200);
  const searchableQuery = normalizeSearch(query);

  return contacts
    .map(toContactSummary)
    .filter((contact) => {
      const searchableContact = normalizeSearch(
        [contact.name, contact.phone, contact.email].filter(Boolean).join(' ')
      );

      return searchableContact.includes(searchableQuery);
    });
}

async function loadContacts(pageSize: number) {
  const result = await Contacts.getContactsAsync({
    fields: CONTACT_FIELDS,
    pageSize,
    sort: Contacts.SortTypes.FirstName,
  });

  return result.data;
}

function parseCreateCommand(command: string) {
  const target = cleanCommandTarget(command, ['create contact', 'add contact', 'save']);
  const email = target.match(/[^\s]+@[^\s]+\.[^\s]+/)?.[0];
  const phone = target.match(/[+()\d][+()\d\s.-]{5,}/)?.[0]?.trim();
  const name = target
    .replace(email ?? '', '')
    .replace(phone ?? '', '')
    .replace(/\bwith\b|\bphone\b|\bemail\b|\bnumber\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { email, name, phone };
}

function cleanCommandTarget(command: string, prefixes: string[]) {
  let target = command.trim();

  for (const prefix of prefixes) {
    const expression = new RegExp(`^${escapeRegExp(prefix)}\\s*`, 'i');
    target = target.replace(expression, '');
  }

  return target.replace(/\s+/g, ' ').trim();
}

function toContactSummary(contact: Contacts.ExistingContact): ContactSummary {
  return {
    id: contact.id,
    name: contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown',
    phone: contact.phoneNumbers?.[0]?.number,
    email: contact.emails?.[0]?.email,
  };
}

function formatContact(contact: ContactSummary) {
  const detail = [contact.phone, contact.email].filter(Boolean).join(' | ');
  return detail ? `- ${contact.name}: ${detail}` : `- ${contact.name}`;
}

function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}@]+/gu, '');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
