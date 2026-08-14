const assert = require('node:assert/strict');
const test = require('node:test');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');

const {
  HubspotContactsService,
} = require('../dist/integrations/hubspot/contacts/contacts.service.js');
const {
  CreateHubspotContactDto,
} = require('../dist/integrations/hubspot/contacts/dto/create-contact.dto.js');
const {
  UpdateHubspotContactDto,
} = require('../dist/integrations/hubspot/contacts/dto/update-contact.dto.js');
const {
  HubspotContactIdentifierQueryDto,
} = require('../dist/integrations/hubspot/contacts/dto/contact-identifier.query.dto.js');
const {
  HubspotApiClient,
} = require('../dist/integrations/hubspot/hubspot-api.client.js');

function createApi(handler) {
  const calls = [];
  return {
    calls,
    request: async (...args) => {
      calls.push(args);
      return handler ? handler(...args) : { results: [] };
    },
  };
}

test('contact creation requires email, first name, or last name', async () => {
  const api = createApi();
  const service = new HubspotContactsService(api);

  await assert.rejects(
    service.create('user-1', { phone: ' +1 555 0100 ', company: 'Acme' }),
    /email, first name, or last name is required/i,
  );
  await assert.rejects(
    service.create('user-1', { firstName: '   ' }),
    /email, first name, or last name is required/i,
  );
  assert.equal(api.calls.length, 0);
});

test('contact creation trims values and translates property names', async () => {
  const api = createApi(() => ({
    id: 'contact-1',
    properties: { firstname: 'Ada', lastname: 'Lovelace' },
  }));
  const service = new HubspotContactsService(api);

  const result = await service.create('user-1', {
    firstName: ' Ada ',
    lastName: ' Lovelace ',
    email: ' ada@example.com ',
  });

  assert.deepEqual(api.calls[0], [
    'user-1',
    'POST',
    '/crm/v3/objects/contacts',
    {
      body: {
        properties: {
          firstname: 'Ada',
          lastname: 'Lovelace',
          email: 'ada@example.com',
        },
      },
    },
  ]);
  assert.equal(result.name, 'Ada Lovelace');
});

test('recent contacts use CRM search sorted by creation date descending', async () => {
  const api = createApi(() => ({
    results: [{ id: 'contact-2', properties: { firstname: 'Newest' } }],
    paging: { next: { after: 'cursor-2' } },
  }));
  const service = new HubspotContactsService(api);

  const result = await service.listRecent('user-1', {
    limit: 10,
    after: 'cursor-1',
  });

  assert.deepEqual(api.calls[0], [
    'user-1',
    'POST',
    '/crm/v3/objects/contacts/search',
    {
      body: {
        limit: 10,
        after: 'cursor-1',
        properties: [
          'firstname',
          'lastname',
          'email',
          'phone',
          'company',
          'lifecyclestage',
        ],
        sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
      },
    },
  ]);
  assert.equal(result.results[0].name, 'Newest');
  assert.equal(result.after, 'cursor-2');
});

test('contact list and free-text search pass through pagination cursors', async () => {
  const api = createApi(() => ({
    results: [],
    paging: { next: { after: 'next-cursor' } },
  }));
  const service = new HubspotContactsService(api);

  const listed = await service.list('user-1', {
    limit: 50,
    after: 'list-cursor',
  });
  const searched = await service.search('user-1', {
    q: ' Ada ',
    limit: 20,
    after: 'search-cursor',
  });

  assert.deepEqual(api.calls[0][3].query, {
    limit: 50,
    after: 'list-cursor',
    properties: 'firstname,lastname,email,phone,company,lifecyclestage',
  });
  assert.equal(api.calls[1][3].body.query, 'Ada');
  assert.equal(api.calls[1][3].body.limit, 20);
  assert.equal(api.calls[1][3].body.after, 'search-cursor');
  assert.equal(listed.after, 'next-cursor');
  assert.equal(searched.after, 'next-cursor');
});

test('contact retrieval supports record ID and email identifiers', async () => {
  const api = createApi((_userId, _method, _path) => ({
    id: 'contact-3',
    properties: { email: 'ada@example.com' },
  }));
  const service = new HubspotContactsService(api);

  await service.getById('user-1', 'contact/3');
  await service.getById('user-1', ' ada@example.com ', 'email');

  assert.equal(api.calls[0][2], '/crm/v3/objects/contacts/contact%2F3');
  assert.deepEqual(api.calls[0][3].query, {
    idProperty: undefined,
    properties: 'firstname,lastname,email,phone,company,lifecyclestage',
  });
  assert.equal(
    api.calls[1][2],
    '/crm/v3/objects/contacts/ada%40example.com',
  );
  assert.equal(api.calls[1][3].query.idProperty, 'email');
});

test('contact update preserves clearing and hydrates the complete summary', async () => {
  const api = createApi((_userId, method) => {
    if (method === 'PATCH') {
      return { id: 'contact-4', properties: { phone: '' } };
    }
    return {
      id: 'contact-4',
      properties: { firstname: 'Ada', email: 'ada@example.com', phone: null },
    };
  });
  const service = new HubspotContactsService(api);

  const result = await service.update(
    'user-1',
    'ada@example.com',
    { phone: '   ' },
    'email',
  );

  assert.deepEqual(api.calls[0], [
    'user-1',
    'PATCH',
    '/crm/v3/objects/contacts/ada%40example.com',
    {
      query: { idProperty: 'email' },
      body: { properties: { phone: '' } },
    },
  ]);
  assert.equal(api.calls[1][1], 'GET');
  assert.equal(api.calls[1][2], '/crm/v3/objects/contacts/contact-4');
  assert.equal(result.name, 'Ada');
  assert.equal(result.phone, undefined);
});

test('contact deletion uses the documented archive route', async () => {
  const api = createApi(() => undefined);
  const service = new HubspotContactsService(api);

  await service.delete('user-1', ' contact/5 ');

  assert.deepEqual(api.calls[0], [
    'user-1',
    'DELETE',
    '/crm/v3/objects/contacts/contact%2F5',
  ]);
});

test('create, update, and identifier DTOs enforce their distinct contracts', async () => {
  const invalidCreate = plainToInstance(CreateHubspotContactDto, {
    lastName: '',
  });
  assert.equal((await validate(invalidCreate)).length > 0, true);

  const clearingUpdate = plainToInstance(UpdateHubspotContactDto, {
    firstName: '',
    email: '',
    phone: '',
  });
  assert.equal((await validate(clearingUpdate)).length, 0);

  const invalidIdentifier = plainToInstance(HubspotContactIdentifierQueryDto, {
    idProperty: 'phone',
  });
  assert.equal((await validate(invalidIdentifier)).length > 0, true);
});

test('HubSpot API client maps auth, not-found, conflict, rate-limit, and server errors', async () => {
  const client = new HubspotApiClient({
    getValidAccessToken: async () => ({ accessToken: 'token' }),
  });
  client.logger = { warn: () => undefined };
  const originalFetch = global.fetch;

  try {
    for (const [status, expectedStatus] of [
      [401, 401],
      [403, 403],
      [404, 404],
      [409, 409],
      [502, 502],
    ]) {
      global.fetch = async () =>
        new Response(JSON.stringify({ message: `failure-${status}` }), {
          status,
        });
      await assert.rejects(
        client.request('user-1', 'GET', '/crm/v3/objects/contacts/1'),
        (error) => error.getStatus() === expectedStatus,
      );
    }

    global.fetch = async () =>
      new Response(JSON.stringify({ message: 'slow down' }), {
        status: 429,
        headers: { 'Retry-After': '12' },
      });
    await assert.rejects(
      client.request('user-1', 'GET', '/crm/v3/objects/contacts'),
      (error) => {
        assert.equal(error.getStatus(), 429);
        assert.equal(error.getResponse().retryAfter, '12');
        return true;
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});
