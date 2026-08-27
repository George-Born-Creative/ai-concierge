const assert = require('node:assert/strict');
const test = require('node:test');

const {
  fallbackActiveCrmProvider,
  disableOtherCrmConnections,
  parseCrmProvider,
  resolveActiveCrmProvider,
  setActiveCrmProviderIfNull,
  userHasCrmConnection,
  userHasCrmPlan,
} = require('../dist/common/crm-account.js');

test('parseCrmProvider accepts ghl and hubspot', () => {
  assert.equal(parseCrmProvider('ghl'), 'GHL');
  assert.equal(parseCrmProvider('HubSpot'), 'HUBSPOT');
  assert.equal(parseCrmProvider('other'), null);
});

test('resolveActiveCrmProvider returns the saved field only', async () => {
  const prisma = {
    user: {
      findUnique: async () => ({ activeCrmProvider: 'HUBSPOT' }),
    },
  };
  assert.equal(await resolveActiveCrmProvider(prisma, 'user-1'), 'HUBSPOT');
});

test('userHasCrmPlan is true only for an active/trialing row of that CRM', async () => {
  const prisma = {
    subscription: {
      findFirst: async ({ where }) =>
        where.plan.provider === 'GHL' ? { id: 'sub-1' } : null,
    },
  };
  assert.equal(await userHasCrmPlan(prisma, 'user-1', 'GHL'), true);
  assert.equal(await userHasCrmPlan(prisma, 'user-1', 'HUBSPOT'), false);
});

test('userHasCrmConnection requires enabled=true', async () => {
  const prisma = {
    integrationConnection: {
      findUnique: async () => ({ enabled: false }),
    },
  };
  assert.equal(await userHasCrmConnection(prisma, 'user-1', 'GHL'), false);
});

test('disableOtherCrmConnections disables every CRM except the one connecting', async () => {
  const updates = [];
  const prisma = {
    integrationConnection: {
      updateMany: async (args) => {
        updates.push(args);
        return { count: 1 };
      },
    },
  };
  await disableOtherCrmConnections(prisma, 'user-1', 'HUBSPOT');
  assert.deepEqual(updates[0].where, {
    userId: 'user-1',
    provider: { not: 'HUBSPOT' },
    enabled: true,
  });
  assert.equal(updates[0].data.enabled, false);
});

test('setActiveCrmProviderIfNull only writes when currently null', async () => {
  const updates = [];
  const prisma = {
    user: {
      updateMany: async (args) => {
        updates.push(args);
        return { count: 1 };
      },
    },
  };
  await setActiveCrmProviderIfNull(prisma, 'user-1', 'GHL');
  assert.deepEqual(updates[0].where, { id: 'user-1', activeCrmProvider: null });
  assert.equal(updates[0].data.activeCrmProvider, 'GHL');
});

test('fallbackActiveCrmProvider keeps the other entitled+connected CRM', async () => {
  const updates = [];
  const prisma = {
    user: {
      findUnique: async () => ({
        activeCrmProvider: 'HUBSPOT',
        subscriptions: [
          { status: 'ACTIVE', plan: { provider: 'GHL' } },
          { status: 'CANCELED', plan: { provider: 'HUBSPOT' } },
        ],
        integrations: [
          { provider: 'GHL', enabled: true },
          { provider: 'HUBSPOT', enabled: false },
        ],
      }),
      update: async (args) => {
        updates.push(args);
        return args;
      },
    },
  };
  const next = await fallbackActiveCrmProvider(prisma, 'user-1');
  assert.equal(next, 'GHL');
  assert.equal(updates[0].data.activeCrmProvider, 'GHL');
});

test('fallbackActiveCrmProvider clears active when nothing remains usable', async () => {
  const updates = [];
  const prisma = {
    user: {
      findUnique: async () => ({
        activeCrmProvider: 'GHL',
        subscriptions: [{ status: 'CANCELED', plan: { provider: 'GHL' } }],
        integrations: [{ provider: 'GHL', enabled: false }],
      }),
      update: async (args) => {
        updates.push(args);
        return args;
      },
    },
  };
  const next = await fallbackActiveCrmProvider(prisma, 'user-1');
  assert.equal(next, null);
  assert.equal(updates[0].data.activeCrmProvider, null);
});
