const assert = require('node:assert/strict');
const test = require('node:test');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');

const {
  HubspotProductsService,
} = require('../dist/integrations/hubspot/products/products.service.js');
const {
  CreateHubspotProductDto,
} = require('../dist/integrations/hubspot/products/dto/create-product.dto.js');
const {
  HubspotCommandService,
} = require('../dist/assistant/hubspot-command.service.js');
const {
  AssistantService,
} = require('../dist/assistant/assistant.service.js');

function harness(handler) {
  const calls = [];
  const api = {
    request: async (...args) => {
      calls.push(args);
      return handler ? handler(...args) : { results: [] };
    },
  };
  return { calls, service: new HubspotProductsService(api) };
}

function rawProduct(properties = {}) {
  return {
    id: 'product-1',
    properties: {
      name: 'Implementation Service',
      price: '6000',
      hs_sku: 'IMP-1',
      hs_cost_of_goods_sold: '600',
      hs_recurring_billing_period: 'P12M',
      ...properties,
    },
    archived: false,
  };
}

test('products use the current 2026-03 endpoints and return complete pricing fields', async () => {
  const tierRanges = JSON.stringify([{ start: 0, end: 99 }, { start: 100 }]);
  const tierPrices = JSON.stringify([{ index: 0, price: 100 }, { index: 1, price: 80 }]);
  const h = harness(() => ({
    results: [rawProduct({
      price: null,
      hs_pricing_model: 'volume',
      hs_tier_ranges: tierRanges,
      hs_tier_prices: tierPrices,
    })],
  }));

  const result = await h.service.list('user-1');
  assert.equal(h.calls[0][2], '/crm/objects/2026-03/products');
  assert.match(h.calls[0][3].query.properties, /hs_tier_prices/);
  assert.equal(result.results[0].pricingModel, 'volume');
  assert.deepEqual(result.results[0].tierRanges, [{ start: 0, end: 99 }, { start: 100 }]);
  assert.equal(result.results[0].recurringBillingPeriod, 'P12M');
});

test('tiered product create serializes HubSpot pricing properties and hydrates the result', async () => {
  const h = harness((_userId, method) =>
    method === 'POST'
      ? rawProduct({ hs_pricing_model: 'volume' })
      : rawProduct({
          price: null,
          hs_pricing_model: 'volume',
          hs_tier_ranges: '[{"start":0,"end":9},{"start":10}]',
          hs_tier_prices: '[{"index":0,"price":100,"currency":"USD"},{"index":1,"price":80,"currency":"USD"}]',
        }),
  );

  const result = await h.service.create('user-1', {
    name: ' Tiered Service ',
    pricingModel: 'volume',
    tierRanges: [{ start: 0, end: 9 }, { start: 10 }],
    tierPrices: [
      { index: 0, price: 100, currency: 'usd' },
      { index: 1, price: 80, currency: 'usd' },
    ],
  });

  assert.equal(h.calls[0][2], '/crm/objects/2026-03/products');
  assert.equal(h.calls[0][3].body.properties.name, 'Tiered Service');
  assert.equal(h.calls[0][3].body.properties.hs_pricing_model, 'volume');
  assert.match(h.calls[0][3].body.properties.hs_tier_prices, /USD/);
  assert.equal(h.calls[1][1], 'GET');
  assert.equal(result.tierPrices[0].currency, 'USD');
});

test('tiered pricing rejects incomplete ranges and a simultaneous standard price', async () => {
  const h = harness();
  await assert.rejects(
    h.service.create('user-1', {
      name: 'Invalid',
      price: 99,
      pricingModel: 'volume',
      tierRanges: [{ start: 0 }],
      tierPrices: [{ index: 0, price: 80 }],
    }),
    /instead of price/i,
  );
  assert.equal(h.calls.length, 0);
});

test('product-to-deal association creates one product-based line item', async () => {
  const h = harness((_userId, method) =>
    method === 'GET' ? rawProduct() : { id: 'line-item-1', properties: {} },
  );
  await h.service.createDealLineItem('user-1', 'product-1', {
    dealId: 'deal-1',
    quantity: 3,
  });

  assert.equal(h.calls[1][2], '/crm/objects/2026-03/line_items');
  assert.deepEqual(h.calls[1][3].body.properties, {
    quantity: 3,
    hs_object_id: 'product-1',
    name: 'Implementation Service',
  });
  assert.equal(h.calls[1][3].body.associations[0].types[0].associationTypeId, 20);
});

test('product DTO validates billing periods, pricing models, and nested tiers', async () => {
  const valid = plainToInstance(CreateHubspotProductDto, {
    name: 'Tiered',
    recurringBillingPeriod: 'P12M',
    pricingModel: 'graduated',
    tierRanges: [{ start: 0, end: 10 }],
    tierPrices: [{ index: 0, price: 20, currency: 'USD' }],
  });
  assert.equal((await validate(valid)).length, 0);

  const invalid = plainToInstance(CreateHubspotProductDto, {
    recurringBillingPeriod: '12 months',
    pricingModel: 'flat',
  });
  assert.ok((await validate(invalid)).length >= 2);
});

test('assistant product responses include complete catalog and lifecycle information', () => {
  const assistant = new HubspotCommandService({}, {}, {}, {}, {}, {});
  const response = assistant.formatProduct({
    id: 'product-1',
    name: 'Volume Plan',
    sku: 'VOL-1',
    description: 'Quantity pricing',
    cost: 40,
    recurringBillingPeriod: 'P12M',
    pricingModel: 'volume',
    tierRanges: [{ start: 0, end: 9 }, { start: 10 }],
    tierPrices: [
      { index: 0, price: 100, currency: 'USD' },
      { index: 1, price: 80, currency: 'USD' },
    ],
    archived: false,
    createdAt: '2026-03-31T18:53:49.908Z',
    updatedAt: '2026-08-13T10:15:00.000Z',
  });

  for (const expected of [
    '### Volume Plan',
    '**Product ID:** `product-1`',
    '**SKU:** `VOL-1`',
    '**Cost of goods:** 40',
    '**Description:** Quantity pricing',
    '**Billing period:** P12M',
    '**Pricing model:** volume',
    '0-9: 100 USD',
    '10+: 80 USD',
    '**Status:** Active',
    '**Created:**',
    '**Last updated:**',
  ]) {
    assert.ok(response.includes(expected), expected);
  }
});

test('chat preserves complete product responses without an LLM polish pass', () => {
  const assistant = new AssistantService({}, {}, {}, {});
  const base = {
    ranActionableIntent: true,
    baseline: { response: 'complete product details', status: 'success' },
  };

  for (const intent of ['list_products', 'find_product', 'create_product', 'update_product']) {
    assert.equal(
      assistant.shouldPolish({ ...base, intent: { intent, entities: {} } }),
      false,
      intent,
    );
  }
  assert.equal(
    assistant.shouldPolish({ ...base, intent: { intent: 'list_contacts', entities: {} } }),
    true,
  );
});
