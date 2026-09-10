const assert = require('node:assert/strict');
const test = require('node:test');

const { GhlApiService } = require('../dist/integrations/ghl/shared/ghl-api.service.js');

function createApi(responder) {
  const api = Object.create(GhlApiService.prototype);
  const calls = [];
  api.requireOpportunityScopes = async () => undefined;
  api.requireLocationId = async () => 'location-1';
  api.audit = async () => undefined;
  api.ghlRequest = async (...args) => {
    calls.push(args);
    return responder ? responder(...args) : {};
  };
  return { api, calls };
}

test('opportunity requests use the v3 header without changing contacts', async () => {
  const api = Object.create(GhlApiService.prototype);
  api.getValidAccessToken = async () => ({ accessToken: 'token', locationId: 'location-1' });
  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    requests.push({ url, init });
    return new Response('{}', { status: 200 });
  };
  try {
    await api.ghlRequest('user-1', 'GET', '/opportunities/search?locationId=location-1');
    await api.ghlRequest('user-1', 'GET', '/contacts/?locationId=location-1');
  } finally {
    global.fetch = originalFetch;
  }
  assert.equal(requests[0].init.headers.Version, 'v3');
  assert.equal(requests[1].init.headers.Version, '2021-07-28');
});

test('opportunity listing uses v3 camelCase query parameters', async () => {
  const { api, calls } = createApi(() => ({ opportunities: [] }));
  await api.listOpportunities('user-1', {
    pipelineId: 'pipe-1',
    pipelineStageId: 'stage-1',
    contactId: 'contact-1',
    assignedTo: 'user-2',
    limit: 50,
  });
  assert.equal(
    calls[0][2],
    '/opportunities/search?locationId=location-1&limit=50&pipelineId=pipe-1&pipelineStageId=stage-1&contactId=contact-1&assignedTo=user-2',
  );
  assert.equal(calls[0][2].includes('location_id'), false);
});

test('advanced opportunity search injects location and preserves pagination', async () => {
  const { api, calls } = createApi(() => ({
    opportunities: [{ id: 'opp-1', name: 'Renewal', pipelineId: 'pipe-1', status: 'open' }],
    meta: { total: 9, page: 2, limit: 1, startAfter: 12, startAfterId: 'opp-1' },
  }));
  const result = await api.searchOpportunities('user-1', { query: 'Renewal', page: 2, limit: 1 });
  assert.deepEqual(calls[0], [
    'user-1',
    'POST',
    '/opportunities/search',
    { query: 'Renewal', page: 2, limit: 1, locationId: 'location-1' },
  ]);
  assert.equal(result.opportunities[0].id, 'opp-1');
  assert.deepEqual(result.meta, {
    total: 9,
    nextPageUrl: null,
    page: 2,
    limit: 1,
    startAfter: 12,
    startAfterId: 'opp-1',
  });
});

test('upsert and followers use documented v3 routes', async () => {
  const { api, calls } = createApi((userId, method, path) =>
    path === '/opportunities/upsert'
      ? { opportunity: { id: 'opp-1', name: 'Deal', pipelineId: 'pipe-1' } }
      : {},
  );
  await api.upsertOpportunity('user-1', {
    pipelineId: 'pipe-1',
    name: 'Deal',
    contactId: 'contact-1',
  });
  await api.addOpportunityFollowers('user-1', 'opp-1', ['user-2', 'user-2']);
  await api.removeOpportunityFollowers('user-1', 'opp-1', undefined, true);
  assert.equal(calls[0][2], '/opportunities/upsert');
  assert.equal(calls[0][3].locationId, 'location-1');
  assert.deepEqual(calls[1][3], { followers: ['user-2'] });
  assert.deepEqual(calls[2][3], { removeAll: true });
});

test('pipeline writes validate stages and inject the connected location', async () => {
  const { api, calls } = createApi(() => ({
    pipeline: { id: 'pipe-1', name: 'Sales', stages: [{ id: 'stage-1', name: 'New' }] },
  }));
  await api.createPipeline('user-1', {
    name: 'Sales',
    stages: [{ name: 'New', position: 0 }],
  });
  assert.equal(calls[0][2], '/opportunities/pipelines');
  assert.equal(calls[0][3].locationId, 'location-1');
  await assert.rejects(
    () => api.createPipeline('user-1', { name: 'Empty', stages: [] }),
    /at least one stage/i,
  );
  await assert.rejects(
    () =>
      api.createPipeline('user-1', {
        name: 'Duplicate',
        stages: [
          { name: 'New', position: 0 },
          { name: 'new', position: 1 },
        ],
      }),
    /unique/i,
  );
});

test('getOpportunity maps nested contact, notes, and follower details', async () => {
  const { api, calls } = createApi(() => ({
    opportunity: {
      id: 'opp-9',
      name: 'Website rebuild',
      monetaryValue: '2500',
      status: 'open',
      pipelineId: 'pipe-1',
      pipelineName: 'Sales',
      pipelineStageId: 'stage-2',
      pipelineStageName: 'Proposal',
      locationId: 'loc-1',
      assignedTo: 'user-2',
      source: 'Referral',
      contact: {
        id: 'ct-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '+15551212',
      },
      followers: [{ name: 'Grace Hopper' }, 'user-3'],
      notes: [{ body: 'Send contract' }, 'Follow up Friday'],
      customFields: [{ key: 'deal_type', fieldValue: 'new' }],
    },
  }));
  const opportunity = await api.getOpportunity('user-1', 'opp-9');
  assert.equal(calls[0][2], '/opportunities/opp-9');
  assert.equal(opportunity.contactName, 'Ada Lovelace');
  assert.equal(opportunity.contactEmail, 'ada@example.com');
  assert.equal(opportunity.contactPhone, '+15551212');
  assert.equal(opportunity.pipelineName, 'Sales');
  assert.equal(opportunity.monetaryValue, 2500);
  assert.deepEqual(opportunity.followers, ['Grace Hopper', 'user-3']);
  assert.deepEqual(opportunity.notes, ['Send contract', 'Follow up Friday']);
  assert.equal(opportunity.customFields[0].fieldValue, 'new');
});
