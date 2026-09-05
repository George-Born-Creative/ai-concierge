const assert = require('node:assert/strict');
const test = require('node:test');

const { UsersService } = require('../dist/users/users.service.js');

function profileUser(overrides = {}) {
  return {
    id: 'user-1',
    name: 'Dave',
    email: 'dave@example.com',
    emailVerified: true,
    timezone: null,
    expoPushToken: null,
    activeCrmProvider: 'GHL',
    openaiKey: null,
    subscriptions: [
      {
        id: 'sub-ghl',
        status: 'ACTIVE',
        paymentProvider: 'STRIPE',
        currentPeriodEnd: new Date('2026-09-30T00:00:00.000Z'),
        plan: {
          code: 'ghl-pro',
          name: 'GHL Pro',
          provider: 'GHL',
          appleProductId: null,
        },
      },
    ],
    integrations: [{ provider: 'GHL', enabled: true, createdAt: new Date() }],
    ...overrides,
  };
}

test('getProfile distinguishes paid, connected, and active CRM', async () => {
  const prisma = {
    user: {
      findUnique: async () =>
        profileUser({
          activeCrmProvider: 'GHL',
          subscriptions: [
            {
              id: 'sub-ghl',
              status: 'ACTIVE',
              paymentProvider: 'STRIPE',
              currentPeriodEnd: new Date('2026-09-30T00:00:00.000Z'),
              plan: { code: 'ghl-pro', name: 'GHL Pro', provider: 'GHL', appleProductId: null },
            },
            {
              id: 'sub-hs',
              status: 'ACTIVE',
              paymentProvider: 'STRIPE',
              currentPeriodEnd: new Date('2026-10-15T00:00:00.000Z'),
              plan: {
                code: 'hubspot-pro',
                name: 'HubSpot Pro',
                provider: 'HUBSPOT',
                appleProductId: null,
              },
            },
          ],
          integrations: [
            { provider: 'GHL', enabled: true, createdAt: new Date() },
            { provider: 'HUBSPOT', enabled: false, createdAt: new Date() },
          ],
        }),
    },
  };
  const profile = await new UsersService(prisma).getProfile('user-1');
  assert.equal(profile.provider, 'ghl');
  assert.equal(profile.plan.id, 'ghl-pro');
  assert.equal(profile.plans.length, 2);
  assert.equal(profile.subscriptions.length, 2);
  assert.equal(profile.subscriptions[1].provider, 'hubspot');
  assert.deepEqual(profile.entitlements, { ghl: true, hubspot: true });
  assert.deepEqual(profile.integrations, { ghl: true, hubspot: false });
  assert.equal(profile.hasIntegration, true);
  assert.equal(profile.plan.expiresAt, '2026-09-30T00:00:00.000Z');
  assert.equal(profile.plans[0].expiresAt, '2026-09-30T00:00:00.000Z');
  assert.equal(profile.plans[1].expiresAt, '2026-10-15T00:00:00.000Z');
});

test('getProfile hydrates missing Stripe period ends before mapping expiresAt', async () => {
  const hydrates = [];
  const billing = {
    hydrateMissingPeriodEnds: async (id) => {
      hydrates.push(id);
    },
  };
  const prisma = {
    user: {
      findUnique: async () => profileUser(),
    },
  };
  await new UsersService(prisma, billing).getProfile('user-1');
  assert.deepEqual(hydrates, ['user-1']);
});

test('listSubscriptions returns every CRM plan on the account', async () => {
  const prisma = {
    user: {
      findUnique: async () =>
        profileUser({
          subscriptions: [
            {
              id: 'sub-ghl',
              status: 'ACTIVE',
              paymentProvider: 'STRIPE',
              currentPeriodEnd: new Date('2026-09-30T00:00:00.000Z'),
              plan: { code: 'ghl-pro', name: 'GHL Pro', provider: 'GHL', appleProductId: null },
            },
            {
              id: 'sub-hs',
              status: 'TRIALING',
              paymentProvider: 'STRIPE',
              currentPeriodEnd: new Date('2026-10-15T00:00:00.000Z'),
              plan: {
                code: 'hubspot-pro',
                name: 'HubSpot Pro',
                provider: 'HUBSPOT',
                appleProductId: null,
              },
            },
          ],
        }),
    },
  };
  const result = await new UsersService(prisma).listSubscriptions('user-1');
  assert.equal(result.subscriptions.length, 2);
  assert.deepEqual(
    result.subscriptions.map((row) => row.provider),
    ['ghl', 'hubspot'],
  );
});

test('setActiveProvider rejects a CRM that is not paid', async () => {
  const prisma = {
    subscription: { findFirst: async () => null },
    integrationConnection: { findUnique: async () => ({ enabled: true }) },
  };
  await assert.rejects(
    () => new UsersService(prisma).setActiveProvider('user-1', { provider: 'hubspot' }),
    (err) => {
      assert.match(err.message, /Subscribe to the HubSpot plan/);
      return true;
    },
  );
});

test('setActiveProvider rejects a CRM that is not connected', async () => {
  const prisma = {
    subscription: { findFirst: async () => ({ id: 'sub-hs' }) },
    integrationConnection: { findUnique: async () => ({ enabled: false }) },
  };
  await assert.rejects(
    () => new UsersService(prisma).setActiveProvider('user-1', { provider: 'hubspot' }),
    (err) => {
      assert.match(err.message, /Connect HubSpot before switching/);
      return true;
    },
  );
});

test('setActiveProvider saves the active CRM when paid and connected', async () => {
  const updates = [];
  const prisma = {
    subscription: { findFirst: async () => ({ id: 'sub-hs' }) },
    integrationConnection: { findUnique: async () => ({ enabled: true }) },
    user: {
      update: async (args) => {
        updates.push(args);
        return args;
      },
      findUnique: async () =>
        profileUser({
          activeCrmProvider: 'HUBSPOT',
          subscriptions: [
            {
              id: 'sub-hs',
              status: 'ACTIVE',
              paymentProvider: 'STRIPE',
              plan: {
                code: 'hubspot-pro',
                name: 'HubSpot Pro',
                provider: 'HUBSPOT',
                appleProductId: null,
              },
            },
          ],
          integrations: [{ provider: 'HUBSPOT', enabled: true, createdAt: new Date() }],
        }),
    },
  };
  const profile = await new UsersService(prisma).setActiveProvider('user-1', {
    provider: 'hubspot',
  });
  assert.equal(updates[0].data.activeCrmProvider, 'HUBSPOT');
  assert.equal(profile.provider, 'hubspot');
});
