const assert = require('node:assert/strict');
const test = require('node:test');

const { BillingService } = require('../dist/billing/billing.service.js');
const { ActiveSubscriptionGuard } = require('../dist/common/guards/active-subscription.guard.js');

function stripeSub(overrides = {}) {
  return {
    id: 'sub_hs',
    metadata: { userId: 'user-1' },
    items: { data: [{ price: { id: 'price_hs' } }] },
    status: 'active',
    current_period_end: 1_800_000_000,
    ...overrides,
  };
}

test('handleSubscriptionEvent upserts by userId+planId and does not disable the other CRM', async () => {
  const upserts = [];
  const integrationUpdates = [];
  const prisma = {
    plan: {
      findUnique: async () => ({ id: 'plan-hs', provider: 'HUBSPOT' }),
    },
    subscription: {
      upsert: async (args) => {
        upserts.push(args);
        return args;
      },
    },
    user: {
      updateMany: async () => ({ count: 1 }),
    },
    integrationConnection: {
      updateMany: async (args) => {
        integrationUpdates.push(args);
        return { count: 0 };
      },
    },
  };
  await new BillingService(prisma, {}, {}).handleSubscriptionEvent(stripeSub());
  assert.deepEqual(upserts[0].where, {
    userId_planId: { userId: 'user-1', planId: 'plan-hs' },
  });
  assert.equal(integrationUpdates.length, 0);
});

test('handleSubscriptionEvent stores current_period_end from Stripe', async () => {
  const upserts = [];
  const prisma = {
    plan: { findUnique: async () => ({ id: 'plan-hs', provider: 'HUBSPOT' }) },
    subscription: {
      upsert: async (args) => {
        upserts.push(args);
        return args;
      },
    },
    user: { updateMany: async () => ({ count: 1 }) },
  };
  await new BillingService(prisma, {}, {}).handleSubscriptionEvent(stripeSub());
  assert.equal(
    upserts[0].update.currentPeriodEnd.toISOString(),
    new Date(1_800_000_000 * 1000).toISOString(),
  );
});

test('handleSubscriptionEvent reads period end from subscription items', async () => {
  const upserts = [];
  const prisma = {
    plan: { findUnique: async () => ({ id: 'plan-hs', provider: 'HUBSPOT' }) },
    subscription: {
      upsert: async (args) => {
        upserts.push(args);
        return args;
      },
    },
    user: { updateMany: async () => ({ count: 1 }) },
  };
  await new BillingService(prisma, {}, {}).handleSubscriptionEvent(
    stripeSub({
      current_period_end: undefined,
      items: { data: [{ price: { id: 'price_hs' }, current_period_end: 1_800_000_000 }] },
    }),
  );
  assert.equal(
    upserts[0].update.currentPeriodEnd.toISOString(),
    new Date(1_800_000_000 * 1000).toISOString(),
  );
});

test('handleSubscriptionEvent does not wipe currentPeriodEnd when Stripe omits it', async () => {
  const upserts = [];
  const prisma = {
    plan: { findUnique: async () => ({ id: 'plan-hs', provider: 'HUBSPOT' }) },
    subscription: {
      upsert: async (args) => {
        upserts.push(args);
        return args;
      },
    },
    user: { updateMany: async () => ({ count: 1 }) },
  };
  await new BillingService(prisma, {}, {}).handleSubscriptionEvent(
    stripeSub({ current_period_end: undefined }),
  );
  assert.equal(upserts[0].update.currentPeriodEnd, undefined);
});

test('hydrateMissingPeriodEnds writes the Stripe period end onto the local row', async () => {
  const updates = [];
  const prisma = {
    subscription: {
      findMany: async () => [{ id: 'row-1', stripeSubscriptionId: 'sub_ghl' }],
      update: async (args) => {
        updates.push(args);
        return args;
      },
    },
  };
  const stripeProvider = {
    client: {
      subscriptions: {
        retrieve: async () => stripeSub({ id: 'sub_ghl' }),
      },
    },
  };
  await new BillingService(prisma, {}, stripeProvider).hydrateMissingPeriodEnds('user-1');
  assert.equal(updates[0].where.id, 'row-1');
  assert.equal(
    updates[0].data.currentPeriodEnd.toISOString(),
    new Date(1_800_000_000 * 1000).toISOString(),
  );
});

test('lapsing one CRM only disables that provider', async () => {
  const integrationUpdates = [];
  const prisma = {
    integrationConnection: {
      updateMany: async (args) => {
        integrationUpdates.push(args);
        return { count: 1 };
      },
    },
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
      update: async () => ({}),
    },
  };
  await new BillingService(prisma, {}, {}).disableIntegrationsForUser('user-1', 'HUBSPOT');
  assert.equal(integrationUpdates[0].where.provider, 'HUBSPOT');
  assert.equal(integrationUpdates[0].where.userId, 'user-1');
});

test('createPaymentSheet does not cancel the other CRM plan', async () => {
  const canceled = [];
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 'user-1',
        email: 'dave@example.com',
        stripeCustomerId: 'cus_1',
        subscriptions: [
          {
            id: 'sub-ghl',
            planId: 'plan-ghl',
            status: 'ACTIVE',
            stripeSubscriptionId: 'sub_ghl',
            plan: { provider: 'GHL' },
          },
        ],
      }),
    },
    subscription: {
      upsert: async () => ({}),
    },
  };
  const plans = {
    findByCode: async () => ({
      id: 'plan-hs',
      code: 'hubspot-pro',
      stripePriceId: 'price_hs',
      provider: 'HUBSPOT',
    }),
  };
  const stripeProvider = {
    publishableKey: 'pk_test',
    client: {
      subscriptions: {
        cancel: async (id) => canceled.push(id),
        create: async () => ({
          id: 'sub_hs',
          status: 'incomplete',
          latest_invoice: { payment_intent: { client_secret: 'pi_secret' } },
        }),
      },
      ephemeralKeys: { create: async () => ({ secret: 'ek_secret' }) },
    },
  };
  await new BillingService(prisma, plans, stripeProvider).createPaymentSheet(
    'user-1',
    'hubspot-pro',
  );
  assert.deepEqual(canceled, []);
});

test('ActiveSubscriptionGuard rejects HubSpot APIs without hubspot-pro', async () => {
  const prisma = {
    subscription: {
      findMany: async () => [{ plan: { provider: 'GHL' } }],
    },
  };
  const reflector = {
    getAllAndOverride: () => 'HUBSPOT',
  };
  const guard = new ActiveSubscriptionGuard(prisma, reflector);
  await assert.rejects(
    () =>
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => ({ user: { id: 'user-1' } }) }),
        getHandler: () => ({}),
        getClass: () => ({}),
      }),
    (err) => {
      assert.match(err.message, /HubSpot subscription is required/);
      return true;
    },
  );
});
