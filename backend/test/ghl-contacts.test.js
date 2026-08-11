const assert = require('node:assert/strict');
const test = require('node:test');

const {
  ContactsService,
} = require('../dist/integrations/ghl/contacts/contacts.service.js');
const {
  GhlApiService,
} = require('../dist/integrations/ghl/shared/ghl-api.service.js');

function createApi(overrides = {}) {
  const calls = [];
  const audits = [];
  return {
    calls,
    audits,
    getValidAccessToken: async () => ({ accessToken: 'token', locationId: 'location-1' }),
    ghlRequest: async (...args) => {
      calls.push(args);
      return { contacts: [], meta: { total: 0 } };
    },
    audit: async (...args) => {
      audits.push(args);
    },
    ...overrides,
  };
}

test('contact listing translates the app query to GHL advanced search', async () => {
  const api = createApi({
    ghlRequest: async (...args) => {
      api.calls.push(args);
      return {
        contacts: [{ id: 'contact-1', firstName: 'Ada', lastName: 'Lovelace' }],
        meta: { total: 25, currentPage: 2, nextPage: 3, pageLimit: 10 },
      };
    },
  });
  const service = new ContactsService(api);

  const result = await service.listContacts('user-1', 10, ' Ada ', 2);

  assert.deepEqual(api.calls[0], [
    'user-1',
    'POST',
    '/contacts/search',
    { locationId: 'location-1', page: 2, pageLimit: 10, query: 'Ada' },
  ]);
  assert.equal(result.contacts[0].name, 'Ada Lovelace');
  assert.deepEqual(result.meta, {
    total: 25,
    currentPage: 2,
    nextPage: 3,
    pageLimit: 10,
    startAfterId: null,
    nextPageUrl: null,
  });
});

test('advanced contact search forwards filters and sorting', async () => {
  const api = createApi();
  const service = new ContactsService(api);
  const filters = [{ field: 'email', operator: 'contains', value: '@example.com' }];
  const sort = [{ field: 'dateAdded', direction: 'desc' }];

  await service.searchContacts('user-1', {
    limit: 20,
    page: 3,
    filters,
    sort,
  });

  assert.deepEqual(api.calls[0][3], {
    locationId: 'location-1',
    page: 3,
    pageLimit: 20,
    filters,
    sort,
  });
});

test('upsert uses the documented endpoint and audits the returned contact', async () => {
  const api = createApi({
    ghlRequest: async (...args) => {
      api.calls.push(args);
      return { contact: { id: 'contact-2', email: 'ada@example.com', name: 'Ada' } };
    },
  });
  const service = new ContactsService(api);

  const contact = await service.upsertContact('user-1', {
    name: ' Ada ',
    email: ' ada@example.com ',
    tags: ['customer'],
  });

  assert.deepEqual(api.calls[0], [
    'user-1',
    'POST',
    '/contacts/upsert',
    {
      locationId: 'location-1',
      name: 'Ada',
      email: 'ada@example.com',
      tags: ['customer'],
    },
  ]);
  assert.equal(contact.id, 'contact-2');
  assert.equal(api.audits[0][1], 'ghl.contact.upsert');
});

test('contact update preserves explicit field clearing', async () => {
  const api = createApi({
    ghlRequest: async (...args) => {
      api.calls.push(args);
      return { contact: { id: 'contact-3', name: 'Ada', phone: '' } };
    },
  });
  const service = new ContactsService(api);

  await service.updateContact('user-1', ' contact-3 ', { phone: null, companyName: '' });

  assert.deepEqual(api.calls[0], [
    'user-1',
    'PUT',
    '/contacts/contact-3',
    { phone: null, companyName: '' },
  ]);
});

test('GHL contact requests use the documented contacts API version header', async () => {
  const api = Object.create(GhlApiService.prototype);
  api.getValidAccessToken = async () => ({ accessToken: 'token', locationId: 'location-1' });
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify({ contact: { id: 'contact-1' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await api.ghlRequest('user-1', 'GET', '/contacts/contact-1');
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(request.init.headers.Version, '2021-07-28');
});

test('get, create, and delete use the documented contact routes', async () => {
  const api = createApi({
    ghlRequest: async (...args) => {
      api.calls.push(args);
      const [, method] = args;
      if (method === 'GET') return { contact: { id: 'contact/4', name: 'Grace' } };
      if (method === 'POST') return { contact: { id: 'contact-5', name: 'Grace' } };
      return {};
    },
  });
  const service = new ContactsService(api);

  await service.getContact('user-1', 'contact/4');
  await service.createContact('user-1', { firstName: ' Grace ' });
  await service.deleteContact('user-1', 'contact/4');

  assert.deepEqual(api.calls[0].slice(0, 3), [
    'user-1',
    'GET',
    '/contacts/contact%2F4',
  ]);
  assert.deepEqual(api.calls[1], [
    'user-1',
    'POST',
    '/contacts/',
    { locationId: 'location-1', firstName: 'Grace' },
  ]);
  assert.deepEqual(api.calls[2].slice(0, 3), [
    'user-1',
    'DELETE',
    '/contacts/contact%2F4',
  ]);
});

test('upsert rejects payloads that cannot participate in duplicate matching', async () => {
  const api = createApi();
  const service = new ContactsService(api);

  await assert.rejects(
    service.upsertContact('user-1', { firstName: 'Ada' }),
    /email or phone is required/i,
  );
  assert.equal(api.calls.length, 0);
});

test('listAllContacts follows every GHL page and removes boundary duplicates', async () => {
  const api = createApi();
  const service = new ContactsService(api);
  const requestedPages = [];
  service.searchContacts = async (_userId, input) => {
    requestedPages.push(input.page);
    if (input.page === 1) {
      return {
        contacts: [
          { id: 'contact-1', name: 'One' },
          { id: 'contact-2', name: 'Two' },
        ],
        meta: { total: 5, currentPage: 1, nextPage: 2, pageLimit: 100 },
      };
    }
    if (input.page === 2) {
      return {
        contacts: [
          { id: 'contact-2', name: 'Two' },
          { id: 'contact-3', name: 'Three' },
          { id: 'contact-4', name: 'Four' },
        ],
        meta: { total: 5, currentPage: 2, nextPage: 3, pageLimit: 100 },
      };
    }
    return {
      contacts: [{ id: 'contact-5', name: 'Five' }],
      meta: { total: 5, currentPage: 3, nextPage: null, pageLimit: 100 },
    };
  };

  const result = await service.listAllContacts('user-1');

  assert.deepEqual(requestedPages, [1, 2, 3]);
  assert.deepEqual(result.contacts.map((contact) => contact.id), [
    'contact-1',
    'contact-2',
    'contact-3',
    'contact-4',
    'contact-5',
  ]);
  assert.equal(result.meta.total, 5);
  assert.equal(result.meta.nextPage, null);
});
