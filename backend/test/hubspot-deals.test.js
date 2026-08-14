const assert = require('node:assert/strict');
const test = require('node:test');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');

const {
  HubspotDealsService,
} = require('../dist/integrations/hubspot/deals/deals.service.js');
const {
  CreateHubspotDealDto,
} = require('../dist/integrations/hubspot/deals/dto/create-deal.dto.js');
const {
  UpdateHubspotDealDto,
} = require('../dist/integrations/hubspot/deals/dto/update-deal.dto.js');
const {
  BatchArchiveHubspotDealsDto,
} = require('../dist/integrations/hubspot/deals/dto/batch-deals.dto.js');
const {
  HubspotAssociationsService,
} = require('../dist/integrations/hubspot/hubspot-associations.service.js');
const {
  HubspotPipelinesService,
} = require('../dist/integrations/hubspot/hubspot-pipelines.service.js');
const {
  HubspotCommandService,
} = require('../dist/assistant/hubspot-command.service.js');

const dealPipelines = [
  {
    id: 'default',
    label: 'Sales Pipeline',
    stages: [
      { id: 'appointmentscheduled', label: 'Appointment Scheduled' },
      { id: 'closedwon', label: 'Closed Won', metadata: { isClosed: 'true', probability: '1' } },
      { id: 'closedlost', label: 'Closed Lost', metadata: { isClosed: 'true', probability: '0' } },
    ],
  },
];

function createHarness(handler) {
  const calls = [];
  const api = {
    request: async (...args) => {
      calls.push(args);
      return handler ? handler(...args) : { results: [] };
    },
  };
  const pipelines = {
    list: async () => dealPipelines,
    resolve: async (_userId, _objectType, pipeline, stage) => ({
      pipeline: dealPipelines[0],
      stage:
        dealPipelines[0].stages.find(
          (candidate) => candidate.id === stage || candidate.label === stage,
        ) ?? dealPipelines[0].stages[0],
    }),
    findLabels: (items, pipelineId, stageId) => {
      const pipeline = items.find((item) => item.id === pipelineId);
      const stage = pipeline?.stages.find((item) => item.id === stageId);
      return { pipelineLabel: pipeline?.label, stageLabel: stage?.label };
    },
  };
  const associationCalls = [];
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
    api,
    calls,
    pipelines,
    associations,
    associationCalls,
    service: new HubspotDealsService(api, pipelines, associations),
  };
}

function rawDeal(overrides = {}) {
  return {
    id: 'deal-1',
    properties: {
      dealname: 'Enterprise Renewal',
      amount: '1250.50',
      deal_currency_code: 'EUR',
      pipeline: 'default',
      dealstage: 'appointmentscheduled',
      ...overrides,
    },
  };
}

test('recent deals use server-side creation-date sorting and preserve pagination', async () => {
  const harness = createHarness(() => ({
    results: [rawDeal()],
    paging: { next: { after: 'next-page' } },
  }));

  const result = await harness.service.listRecent('user-1', {
    limit: 10,
    after: 'current-page',
  });

  assert.equal(harness.calls[0][2], '/crm/v3/objects/deals/search');
  assert.deepEqual(harness.calls[0][3].body.sorts, [
    { propertyName: 'createdate', direction: 'DESCENDING' },
  ]);
  assert.equal(harness.calls[0][3].body.after, 'current-page');
  assert.equal(result.after, 'next-page');
  assert.equal(result.results[0].stageLabel, 'Appointment Scheduled');
});

test('deal search trims the query and uses the CRM search endpoint', async () => {
  const harness = createHarness(() => ({ results: [] }));

  await harness.service.search('user-1', { q: ' Renewal ', limit: 20 });

  assert.equal(harness.calls[0][3].body.query, 'Renewal');
  assert.equal(harness.calls[0][3].body.limit, 20);
  await assert.rejects(harness.service.search('user-1', { q: '   ' }), /cannot be empty/i);
});

test('deal create resolves pipeline IDs and forwards documented associations', async () => {
  const association = {
    to: { id: 'contact-1' },
    types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }],
  };
  const harness = createHarness(() => rawDeal());

  const result = await harness.service.create('user-1', {
    name: ' Enterprise Renewal ',
    amount: 1250.5,
    currency: ' EUR ',
    pipeline: 'Sales Pipeline',
    stage: 'Appointment Scheduled',
    associations: [association],
  });

  assert.deepEqual(harness.calls[0][3].body, {
    properties: {
      dealname: 'Enterprise Renewal',
      amount: '1250.5',
      deal_currency_code: 'EUR',
      pipeline: 'default',
      dealstage: 'appointmentscheduled',
    },
    associations: [association],
  });
  assert.equal(result.currency, 'EUR');
  assert.equal(result.pipelineLabel, 'Sales Pipeline');
});

test('deal create rejects a missing name before making a HubSpot request', async () => {
  const harness = createHarness();
  await assert.rejects(harness.service.create('user-1', { name: '  ' }), /name is required/i);
  assert.equal(harness.calls.length, 0);
});

test('deal update supports custom identifiers, clearing, and canonical hydration', async () => {
  const harness = createHarness((_userId, method) =>
    method === 'PATCH' ? { id: 'deal-1', properties: {} } : rawDeal({ description: null }),
  );

  const result = await harness.service.update(
    'user-1',
    'ORDER-9',
    { description: '', amount: null },
    'uniqueordernumber',
  );

  assert.deepEqual(harness.calls[0][3], {
    query: { idProperty: 'uniqueordernumber' },
    body: { properties: { amount: '', description: '' } },
  });
  assert.equal(harness.calls[1][2], '/crm/v3/objects/deals/deal-1');
  assert.equal(result.name, 'Enterprise Renewal');
});

test('detailed deal reads forward custom properties, history, and associations', async () => {
  const harness = createHarness(() => ({
    ...rawDeal(),
    propertiesWithHistory: { dealstage: [{ value: 'old-stage' }] },
    associations: { contacts: { results: [{ id: 'contact-1' }] } },
  }));

  const result = await harness.service.getDetail('user-1', 'deal-1', {
    properties: ['custom_code'],
    propertiesWithHistory: ['dealstage'],
    associations: ['contacts'],
  });

  const query = harness.calls[0][3].query;
  assert.match(query.properties, /custom_code/);
  assert.equal(query.propertiesWithHistory, 'dealstage');
  assert.equal(query.associations, 'contacts');
  assert.equal(result.associations.contacts.results[0].id, 'contact-1');
});

test('batch read preserves per-record errors and custom identifiers', async () => {
  const harness = createHarness(() => ({
    status: 'COMPLETE',
    results: [rawDeal()],
    errors: [{ status: 'error', id: 'missing' }],
  }));

  const result = await harness.service.batchRead('user-1', {
    ids: ['ORDER-1', 'ORDER-2'],
    idProperty: 'uniqueordernumber',
    propertiesWithHistory: ['dealstage'],
  });

  assert.equal(harness.calls[0][2], '/crm/v3/objects/deals/batch/read');
  assert.equal(harness.calls[0][3].body.idProperty, 'uniqueordernumber');
  assert.equal(result.errors.length, 1);
  assert.equal(result.results[0].currency, 'EUR');
});

test('batch update and archive enforce the 100-record limit and documented routes', async () => {
  const harness = createHarness(() => ({ results: [rawDeal()] }));

  await harness.service.batchUpdate('user-1', [
    { id: 'deal-1', properties: { amount: 99 } },
  ]);
  await harness.service.batchArchive('user-1', ['deal-1', 'deal-2']);

  assert.equal(harness.calls[0][2], '/crm/v3/objects/deals/batch/update');
  assert.equal(harness.calls[0][3].body.inputs[0].properties.amount, '99');
  assert.equal(harness.calls[1][2], '/crm/v3/objects/deals/batch/archive');
  await assert.rejects(
    harness.service.batchArchive('user-1', Array.from({ length: 101 }, (_, i) => String(i))),
    /between 1 and 100/i,
  );
});

test('deal-side associations delegate to the shared association service', async () => {
  const harness = createHarness();
  await harness.service.associate('user-1', 'deal-1', 'contacts', 'contact-1');
  await harness.service.disassociate('user-1', 'deal-1', 'notes', 'note-1');

  assert.deepEqual(harness.associationCalls, [
    ['associate', 'user-1', 'deals', 'deal-1', 'contacts', 'contact-1'],
    ['disassociate', 'user-1', 'deals', 'deal-1', 'notes', 'note-1'],
  ]);
});

test('shared association service validates IDs and builds encoded v4 routes', async () => {
  const calls = [];
  const service = new HubspotAssociationsService({
    request: async (...args) => calls.push(args),
  });

  await service.associate('user-1', 'deals', 'deal/1', 'contacts', 'contact/1');
  assert.equal(
    calls[0][2],
    '/crm/v4/objects/deals/deal%2F1/associations/default/contacts/contact%2F1',
  );
  await assert.rejects(
    service.disassociate('user-1', 'deals', '', 'contacts', 'contact-1'),
    /Deal id is required/i,
  );
});

test('pipeline service resolves IDs and labels and rejects ambiguous selectors', async () => {
  const service = new HubspotPipelinesService({
    request: async () => ({
      results: [
        { id: 'one', label: 'Direct Sales', stages: [{ id: 'new', label: 'New' }] },
        { id: 'two', label: 'Partner Sales', stages: [{ id: 'qualified', label: 'New Lead' }] },
      ],
    }),
  });

  const resolved = await service.resolve('user-1', 'deals', 'Direct Sales', 'New');
  assert.equal(resolved.pipeline.id, 'one');
  assert.equal(resolved.stage.id, 'new');
  await assert.rejects(service.resolve('user-1', 'deals', 'Sales'), /ambiguous/i);
});

test('deal DTOs distinguish create requirements, clearing updates, and batch limits', async () => {
  const invalidCreate = plainToInstance(CreateHubspotDealDto, { name: '' });
  assert.equal((await validate(invalidCreate)).length > 0, true);

  const validClearingUpdate = plainToInstance(UpdateHubspotDealDto, {
    amount: null,
    closeDate: '',
    description: '',
  });
  assert.equal((await validate(validClearingUpdate)).length, 0);

  const invalidBatch = plainToInstance(BatchArchiveHubspotDealsDto, {
    ids: Array.from({ length: 101 }, (_, index) => String(index)),
  });
  assert.equal((await validate(invalidBatch)).length > 0, true);
});

test('assistant uses recent deal search and formats amounts with the deal currency', async () => {
  let recentQuery;
  const command = new HubspotCommandService(
    {},
    {
      listRecent: async (_userId, query) => {
        recentQuery = query;
        return {
          results: [
            {
              id: 'deal-1',
              name: 'Renewal',
              amount: 1250.5,
              currency: 'EUR',
              stage: 'closedwon',
              stageLabel: 'Closed Won',
              createdAt: null,
              updatedAt: null,
            },
          ],
        };
      },
    },
    {},
    {},
    {},
    {},
  );

  const result = await command.listRecentDeals('user-1');
  assert.deepEqual(recentQuery, { limit: 10 });
  assert.equal(result.status, 'success');
  assert.match(result.response, /Renewal/);
  assert.match(result.response, /Closed Won/);
  assert.match(result.response, /EUR|€/);
  assert.doesNotMatch(result.response, /\$/);
});

test('assistant deal lookup asks the user to disambiguate server-side search matches', async () => {
  let searchQuery;
  const command = new HubspotCommandService(
    {},
    {
      search: async (_userId, query) => {
        searchQuery = query;
        return {
          results: [
            { id: '1', name: 'Renewal East', amount: null, createdAt: null, updatedAt: null },
            { id: '2', name: 'Renewal West', amount: null, createdAt: null, updatedAt: null },
          ],
        };
      },
    },
    {},
    {},
    {},
    {},
  );

  const result = await command.findDeal('user-1', 'Renewal');
  assert.deepEqual(searchQuery, { q: 'Renewal', limit: 25 });
  assert.equal(result.status, 'error');
  assert.match(result.response, /Which deal/);
  assert.match(result.response, /Renewal East/);
  assert.match(result.response, /Renewal West/);
});
