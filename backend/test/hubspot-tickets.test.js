const assert = require('node:assert/strict');
const test = require('node:test');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');

const {
  HubspotTicketsService,
} = require('../dist/integrations/hubspot/tickets/tickets.service.js');
const {
  BatchArchiveHubspotTicketsDto,
} = require('../dist/integrations/hubspot/tickets/dto/batch-tickets.dto.js');
const {
  CreateHubspotTicketDto,
} = require('../dist/integrations/hubspot/tickets/dto/create-ticket.dto.js');
const {
  HubspotCommandService,
} = require('../dist/assistant/hubspot-command.service.js');

const ticketPipelines = [
  {
    id: 'support',
    label: 'Support Pipeline',
    stages: [
      { id: 'new', label: 'New' },
      { id: 'waiting', label: 'Waiting on us' },
    ],
  },
];

function rawTicket(overrides = {}) {
  return {
    id: 'ticket-1',
    properties: {
      subject: 'Login failure',
      content: 'Customer cannot sign in',
      hs_ticket_priority: 'HIGH',
      hs_pipeline: 'support',
      hs_pipeline_stage: 'new',
      ...overrides,
    },
  };
}

function createHarness(handler) {
  const calls = [];
  const api = {
    request: async (...args) => {
      calls.push(args);
      return handler ? handler(...args) : { results: [] };
    },
  };
  const pipelines = {
    list: async () => ticketPipelines,
    resolve: async (_userId, objectType, pipeline, stage) => {
      assert.equal(objectType, 'tickets');
      return {
        pipeline: ticketPipelines.find((item) => item.id === pipeline || item.label === pipeline)
          ?? ticketPipelines[0],
        stage: ticketPipelines[0].stages.find(
          (item) => item.id === stage || item.label === stage,
        ) ?? ticketPipelines[0].stages[0],
      };
    },
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
    calls,
    associationCalls,
    service: new HubspotTicketsService(api, associations, pipelines),
  };
}

test('ticket list requests labels, read fields, and cursor pagination', async () => {
  const harness = createHarness(() => ({
    results: [rawTicket()],
    paging: { next: { after: 'next-ticket' } },
  }));
  const result = await harness.service.list('user-1', {
    limit: 50,
    after: 'current',
    properties: ['custom_code'],
    propertiesWithHistory: ['hs_pipeline_stage'],
    associations: ['contacts'],
  });
  const query = harness.calls[0][3].query;
  assert.equal(query.after, 'current');
  assert.match(query.properties, /custom_code/);
  assert.equal(query.propertiesWithHistory, 'hs_pipeline_stage');
  assert.equal(query.associations, 'contacts');
  assert.equal(result.after, 'next-ticket');
  assert.equal(result.results[0].stageLabel, 'New');
});

test('ticket search supports filters, documented string sorting, and total', async () => {
  const harness = createHarness(() => ({ results: [rawTicket()], total: 7 }));
  const result = await harness.service.search('user-1', {
    priority: 'HIGH',
    pipeline: 'support',
    sort: 'created_desc',
    limit: 200,
  });
  const body = harness.calls[0][3].body;
  assert.deepEqual(body.sorts, ['-createdate']);
  assert.equal(body.limit, 200);
  assert.equal(body.filterGroups[0].filters.length, 2);
  assert.equal(result.total, 7);
  await assert.rejects(harness.service.search('user-1', {}), /query or at least one/i);
});

test('ticket create resolves portal pipeline labels, associations, and pinned activity', async () => {
  const harness = createHarness((_userId, method) =>
    method === 'POST' ? { id: 'ticket-1', properties: {} } : rawTicket({
      hs_pinned_engagement_id: 'engagement-1',
    }),
  );
  const result = await harness.service.create('user-1', {
    subject: ' Login failure ',
    pipeline: 'Support Pipeline',
    stage: 'New',
    pinnedEngagementId: 'engagement-1',
    associations: [
      {
        toId: 'contact-1',
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 16 }],
      },
    ],
  });
  assert.deepEqual(harness.calls[0][3].body, {
    properties: {
      subject: 'Login failure',
      hs_pinned_engagement_id: 'engagement-1',
      hs_pipeline: 'support',
      hs_pipeline_stage: 'new',
    },
    associations: [
      {
        to: { id: 'contact-1' },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 16 }],
      },
    ],
  });
  assert.equal(harness.calls[1][1], 'GET');
  assert.equal(result.pipelineLabel, 'Support Pipeline');
  assert.equal(result.pinnedEngagementId, 'engagement-1');
});

test('ticket update supports custom identifiers and explicit field clearing', async () => {
  const harness = createHarness((_userId, method) =>
    method === 'PATCH' ? { id: 'ticket-1', properties: {} } : rawTicket({ content: null }),
  );
  await harness.service.update(
    'user-1',
    'external-9',
    { content: null, ownerId: null, properties: { custom_code: null } },
    'external_ticket_id',
  );
  assert.deepEqual(harness.calls[0][3], {
    query: { idProperty: 'external_ticket_id' },
    body: { properties: { custom_code: '', content: '', hubspot_owner_id: '' } },
  });
  assert.equal(harness.calls[1][2], '/crm/v3/objects/tickets/ticket-1');
});

test('ticket detail, properties, and custom association routes are forwarded', async () => {
  const harness = createHarness(() => rawTicket());
  await harness.service.getDetail('user-1', 'ticket-1', {
    propertiesWithHistory: ['hs_pipeline_stage'],
    associations: ['contacts'],
  });
  await harness.service.listProperties('user-1');
  await harness.service.associate('user-1', 'ticket-1', 'notes', 'note-1', 227);
  assert.equal(harness.calls[0][3].query.propertiesWithHistory, 'hs_pipeline_stage');
  assert.equal(harness.calls[1][2], '/crm/v3/properties/tickets');
  assert.equal(
    harness.calls[2][2],
    '/crm/v3/objects/tickets/ticket-1/associations/notes/note-1/227',
  );
});

test('ticket default associations delegate to the shared association service', async () => {
  const harness = createHarness();
  await harness.service.associateContact('user-1', 'ticket-1', 'contact-1');
  await harness.service.disassociateDeal('user-1', 'ticket-1', 'deal-1');
  assert.deepEqual(harness.associationCalls, [
    ['associate', 'user-1', 'tickets', 'ticket-1', 'contacts', 'contact-1'],
    ['disassociate', 'user-1', 'tickets', 'ticket-1', 'deals', 'deal-1'],
  ]);
});

test('ticket batch operations preserve errors and enforce the 100-record limit', async () => {
  const harness = createHarness(() => ({
    status: 'COMPLETE',
    results: [rawTicket()],
    errors: [{ id: 'missing', status: 'error' }],
  }));
  const read = await harness.service.batchRead('user-1', {
    ids: ['ticket-1'],
    idProperty: 'external_ticket_id',
  });
  await harness.service.batchUpdate('user-1', [
    { id: 'ticket-1', properties: { priority: 'LOW' } },
  ]);
  await harness.service.batchArchive('user-1', ['ticket-1']);
  assert.equal(read.errors.length, 1);
  assert.equal(harness.calls[0][3].body.idProperty, 'external_ticket_id');
  assert.equal(harness.calls[1][2], '/crm/v3/objects/tickets/batch/update');
  assert.equal(harness.calls[2][2], '/crm/v3/objects/tickets/batch/archive');
  await assert.rejects(
    harness.service.batchArchive('user-1', Array.from({ length: 101 }, (_, index) => String(index))),
    /between 1 and 100/i,
  );
});

test('ticket DTOs require a subject and cap archive batches', async () => {
  const create = plainToInstance(CreateHubspotTicketDto, { priority: 'HIGH' });
  assert.equal((await validate(create)).some((error) => error.property === 'subject'), true);
  const batch = plainToInstance(BatchArchiveHubspotTicketsDto, {
    ids: Array.from({ length: 101 }, (_, index) => String(index)),
  });
  assert.equal((await validate(batch)).some((error) => error.property === 'ids'), true);
});

test('assistant asks before archiving and archives only after confirmation', async () => {
  let archived = false;
  const tickets = {
    getById: async () => ({ id: 'ticket-1', subject: 'Login failure' }),
    archive: async () => { archived = true; },
  };
  const assistant = new HubspotCommandService(undefined, undefined, undefined, tickets);
  const first = await assistant.deleteTicket('user-1', { id: 'ticket-1' });
  assert.equal(first.pendingIntent.missing[0], 'confirmation');
  assert.equal(archived, false);
  const confirmed = await assistant.deleteTicket('user-1', { id: 'ticket-1' }, 'yes');
  assert.equal(confirmed.status, 'success');
  assert.match(confirmed.response, /recycling bin/i);
  assert.equal(archived, true);
});
