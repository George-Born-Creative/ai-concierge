const assert = require('node:assert/strict');
const test = require('node:test');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');

const {
  HubspotCompaniesService,
} = require('../dist/integrations/hubspot/companies/companies.service.js');
const {
  BatchArchiveHubspotCompaniesDto,
} = require('../dist/integrations/hubspot/companies/dto/batch-companies.dto.js');
const {
  CreateHubspotCompanyDto,
} = require('../dist/integrations/hubspot/companies/dto/create-company.dto.js');
const {
  UpdateHubspotCompanyDto,
} = require('../dist/integrations/hubspot/companies/dto/update-company.dto.js');

function createHarness(handler) {
  const calls = [];
  const associationCalls = [];
  const api = {
    request: async (...args) => {
      calls.push(args);
      return handler ? handler(...args) : { results: [] };
    },
  };
  const associations = {
    associate: async (...args) => {
      associationCalls.push(['associate', ...args]);
      return { ok: true };
    },
    disassociate: async (...args) => {
      associationCalls.push(['disassociate', ...args]);
      return { ok: true };
    },
  };
  return {
    calls,
    associationCalls,
    service: new HubspotCompaniesService(api, associations),
  };
}

function rawCompany(overrides = {}) {
  return {
    id: 'company-1',
    properties: {
      name: 'Acme',
      domain: 'acme.test',
      hs_additional_domains: 'shop.acme.test;help.acme.test',
      lifecyclestage: 'customer',
      numberofemployees: '42',
      hs_lastactivitydate: '2026-08-16T10:30:00Z',
      ...overrides,
    },
  };
}

test('company list uses the current dated API and preserves pagination', async () => {
  const harness = createHarness(() => ({
    results: [rawCompany()],
    paging: { next: { after: 'next-page' } },
  }));

  const result = await harness.service.list('user-1', { limit: 50, after: 'page-1' });

  assert.equal(harness.calls[0][2], '/crm/objects/2026-03/companies');
  assert.equal(harness.calls[0][3].query.after, 'page-1');
  assert.equal(result.after, 'next-page');
  assert.deepEqual(result.results[0].additionalDomains, [
    'shop.acme.test',
    'help.acme.test',
  ]);
  assert.equal(result.results[0].numberOfEmployees, 42);
  assert.equal(result.results[0].lastActivityAt, '2026-08-16T10:30:00Z');
});

test('recent companies use server-side creation sorting on CRM search', async () => {
  const harness = createHarness(() => ({ results: [] }));

  await harness.service.listRecent('user-1', { limit: 10, after: 'cursor' });

  assert.equal(harness.calls[0][2], '/crm/v3/objects/companies/search');
  assert.deepEqual(harness.calls[0][3].body.sorts, [
    { propertyName: 'createdate', direction: 'DESCENDING' },
  ]);
  assert.equal(harness.calls[0][3].body.after, 'cursor');
});

test('company create requires name or domain and forwards associations', async () => {
  const association = {
    to: { id: 'contact-1' },
    types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 280 }],
  };
  const harness = createHarness(() => rawCompany());

  await assert.rejects(
    harness.service.create('user-1', { phone: '555-0100' }),
    /name or domain is required/i,
  );
  const result = await harness.service.create('user-1', {
    domain: ' acme.test ',
    additionalDomains: [' shop.acme.test ', 'help.acme.test'],
    lifecycleStage: ' customer ',
    associations: [association],
  });

  assert.deepEqual(harness.calls[0][3].body, {
    properties: {
      domain: 'acme.test',
      hs_additional_domains: 'shop.acme.test;help.acme.test',
      lifecyclestage: 'customer',
    },
    associations: [association],
  });
  assert.equal(result.name, 'Acme');
});

test('company update supports custom IDs, clearing, and canonical hydration', async () => {
  const harness = createHarness((_userId, method) =>
    method === 'PATCH' ? { id: 'company-1', properties: {} } : rawCompany({ website: null }),
  );

  const result = await harness.service.update(
    'user-1',
    'EXT-9',
    { website: '', additionalDomains: [], numberOfEmployees: null },
    'external_company_id',
  );

  assert.deepEqual(harness.calls[0][3], {
    query: { idProperty: 'external_company_id' },
    body: {
      properties: {
        hs_additional_domains: '',
        numberofemployees: '',
        website: '',
      },
    },
  });
  assert.equal(harness.calls[1][2], '/crm/objects/2026-03/companies/company-1');
  assert.equal(result.name, 'Acme');
});

test('detailed reads forward custom properties, history, associations, and identifier', async () => {
  const harness = createHarness(() => ({
    ...rawCompany(),
    propertiesWithHistory: { lifecyclestage: [{ value: 'lead' }] },
    associations: { contacts: { results: [{ id: 'contact-1' }] } },
  }));

  const result = await harness.service.getDetail('user-1', 'EXT-9', {
    idProperty: 'external_company_id',
    properties: ['custom_code'],
    propertiesWithHistory: ['lifecyclestage'],
    associations: ['contacts'],
  });

  assert.equal(harness.calls[0][3].query.idProperty, 'external_company_id');
  assert.match(harness.calls[0][3].query.properties, /custom_code/);
  assert.equal(harness.calls[0][3].query.propertiesWithHistory, 'lifecyclestage');
  assert.equal(harness.calls[0][3].query.associations, 'contacts');
  assert.equal(result.associations.contacts.results[0].id, 'contact-1');
});

test('company batches use dated routes, preserve errors, and enforce limits', async () => {
  const harness = createHarness(() => ({
    status: 'COMPLETE',
    results: [rawCompany()],
    errors: [{ id: 'missing', status: 'error' }],
  }));

  const read = await harness.service.batchRead('user-1', {
    ids: ['EXT-1'],
    idProperty: 'external_company_id',
  });
  await harness.service.batchUpdate('user-1', [
    { id: 'company-1', properties: { lifecycleStage: 'customer' } },
  ]);
  await harness.service.batchArchive('user-1', ['company-1']);

  assert.equal(harness.calls[0][2], '/crm/objects/2026-03/companies/batch/read');
  assert.equal(harness.calls[0][3].body.idProperty, 'external_company_id');
  assert.equal(harness.calls[1][2], '/crm/objects/2026-03/companies/batch/update');
  assert.equal(harness.calls[2][2], '/crm/objects/2026-03/companies/batch/archive');
  assert.equal(read.errors.length, 1);
  await assert.rejects(
    harness.service.batchArchive('user-1', Array.from({ length: 101 }, (_, i) => String(i))),
    /between 1 and 100/i,
  );
});

test('company associations support any CRM object type', async () => {
  const harness = createHarness();
  await harness.service.associate('user-1', 'company-1', 'notes', 'note-1');
  await harness.service.disassociate('user-1', 'company-1', 'tickets', 'ticket-1');

  assert.deepEqual(harness.associationCalls, [
    ['associate', 'user-1', 'companies', 'company-1', 'notes', 'note-1'],
    ['disassociate', 'user-1', 'companies', 'company-1', 'tickets', 'ticket-1'],
  ]);
});

test('company DTOs validate create fields, clearing updates, and batch limits', async () => {
  const invalidCreate = plainToInstance(CreateHubspotCompanyDto, { name: '' });
  assert.equal((await validate(invalidCreate)).length > 0, true);

  const clearingUpdate = plainToInstance(UpdateHubspotCompanyDto, {
    name: '',
    website: '',
    additionalDomains: [],
    numberOfEmployees: null,
  });
  assert.equal((await validate(clearingUpdate)).length, 0);

  const invalidBatch = plainToInstance(BatchArchiveHubspotCompaniesDto, {
    ids: Array.from({ length: 101 }, (_, index) => String(index)),
  });
  assert.equal((await validate(invalidBatch)).length > 0, true);
});
