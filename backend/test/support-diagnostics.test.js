const assert = require('node:assert/strict');
const test = require('node:test');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');

const {
  sanitizeClientDiagnostics,
} = require('../dist/support/support-diagnostics.policy.js');
const {
  SupportDiagnosticsService,
} = require('../dist/support/support-diagnostics.service.js');
const { SupportService } = require('../dist/support/support.service.js');
const {
  CreateSupportRequestDto,
} = require('../dist/support/dto/create-support-request.dto.js');

const validClient = {
  capturedAt: '2026-07-22T12:00:00.000Z',
  appVersion: '1.4.0',
  buildVersion: '42',
  platform: 'android',
  osVersion: '15',
  executionEnvironment: 'standalone',
  timezone: 'Africa/Nairobi',
  locale: 'en-KE',
  networkType: 'wifi',
  networkReachable: true,
  pushStatus: 'granted',
  apiHost: 'https://token@api.example.com/private?jwt=secret',
  apiReachable: true,
};

test('client diagnostics copy only allowlisted scalar fields', () => {
  const sanitized = sanitizeClientDiagnostics({
    ...validClient,
    jwt: 'ey-secret',
    accessToken: 'oauth-secret',
    refreshToken: 'refresh-secret',
    apiKey: 'sk-secret',
    deviceId: 'stable-device-id',
    crmRecord: { email: 'customer@example.com' },
    rawError: 'Authorization: Bearer secret',
  });

  assert.deepEqual(Object.keys(sanitized).sort(), [
    'apiHost',
    'apiReachable',
    'appVersion',
    'buildVersion',
    'capturedAt',
    'executionEnvironment',
    'locale',
    'networkReachable',
    'networkType',
    'osVersion',
    'platform',
    'pushStatus',
    'timezone',
  ]);
  assert.equal(sanitized.apiHost, 'api.example.com');
  const encoded = JSON.stringify(sanitized);
  for (const forbidden of [
    'ey-secret',
    'oauth-secret',
    'refresh-secret',
    'sk-secret',
    'stable-device-id',
    'customer@example.com',
    '/private',
    'jwt=',
  ]) {
    assert.equal(encoded.includes(forbidden), false, forbidden);
  }
});

test('invalid enums and raw host content degrade to safe values', () => {
  const sanitized = sanitizeClientDiagnostics({
    ...validClient,
    platform: 'rooted-phone-123',
    pushStatus: 'Bearer abc',
    apiHost: 'not a host / Authorization: secret',
    networkReachable: 'yes',
    apiReachable: 'yes',
  });

  assert.equal(sanitized.platform, 'unknown');
  assert.equal(sanitized.pushStatus, 'unknown');
  assert.equal(sanitized.apiHost, 'unknown');
  assert.equal(sanitized.networkReachable, null);
  assert.equal(sanitized.apiReachable, false);
});

test('request DTO rejects non-allowlisted nested diagnostic fields', async () => {
  const dto = plainToInstance(CreateSupportRequestDto, {
    clientRequestId: 'support-request-123456',
    category: 'CONNECTIVITY',
    subject: 'Cannot reach the service',
    description:
      'The service is unavailable even after reconnecting to the network.',
    includeDiagnostics: true,
    clientDiagnostics: {
      ...validClient,
      apiHost: 'api.example.com',
      accessToken: 'must-not-be-accepted',
    },
  });
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  assert.equal(errors.length > 0, true);
  assert.equal(JSON.stringify(errors).includes('accessToken'), true);
});

test('server diagnostics use an explicit secret-free database select', async () => {
  let selected;
  const prisma = {
    user: {
      findUnique: async (args) => {
        selected = args.select;
        return {
          emailVerified: true,
          timezone: 'Africa/Nairobi',
          expoPushToken: 'ExponentPushToken[secret]',
          subscription: {
            status: 'ACTIVE',
            paymentProvider: 'STRIPE',
            currentPeriodEnd: new Date('2026-08-22T00:00:00.000Z'),
            plan: { provider: 'HUBSPOT' },
          },
          integrations: [
            {
              provider: 'HUBSPOT',
              enabled: true,
              expiresAt: null,
              scopes: ['crm.objects.contacts.read'],
              accessToken: 'oauth-secret',
              refreshToken: 'refresh-secret',
            },
          ],
          openaiKey: { id: 'key-row', encryptedKey: 'sk-secret' },
        };
      },
    },
  };

  const result = await new SupportDiagnosticsService(prisma).getDiagnostics(
    'user-1',
  );
  const query = JSON.stringify(selected);
  for (const forbiddenKey of [
    'accessToken',
    'refreshToken',
    'encryptedKey',
    'last4',
    'locationId',
    'portalId',
  ]) {
    assert.equal(query.includes(forbiddenKey), false, forbiddenKey);
  }

  const encoded = JSON.stringify(result);
  for (const forbidden of [
    'ExponentPushToken[secret]',
    'oauth-secret',
    'refresh-secret',
    'sk-secret',
    'crm.objects.contacts.read',
  ]) {
    assert.equal(encoded.includes(forbidden), false, forbidden);
  }
  assert.equal(result.groups.length, 2);
});

test('support intake stores diagnostics only after explicit opt-in', async () => {
  const created = [];
  const prisma = {
    supportRequest: {
      findUnique: async () => null,
      count: async () => 0,
      create: async ({ data }) => {
        created.push(data);
        return {
          ...data,
          id: `request-${created.length}`,
          deliveryStatus: 'PENDING',
          createdAt: new Date('2026-07-22T12:00:00.000Z'),
        };
      },
    },
    user: { findUnique: async () => ({ email: 'owner@example.com' }) },
    $transaction: async () => [0, 0],
  };
  const delivery = { deliverRequest: async () => null };
  const config = {
    get: (key) =>
      key === 'SUPPORT_INBOX_EMAIL'
        ? 'support@ai-concierge.test'
        : key === 'NODE_ENV'
          ? 'test'
          : undefined,
  };
  let diagnosticCalls = 0;
  const diagnostics = {
    getDiagnostics: async () => {
      diagnosticCalls += 1;
      return { generatedAt: validClient.capturedAt, groups: [] };
    },
  };
  const service = new SupportService(prisma, delivery, config, diagnostics);
  const baseRequest = {
    clientRequestId: 'support-request-123456',
    category: 'CONNECTIVITY',
    subject: 'Cannot reach the service',
    description:
      'The service is unavailable even after reconnecting to the network.',
  };

  await service.createRequest('user-1', {
    ...baseRequest,
    includeDiagnostics: false,
    clientDiagnostics: { ...validClient, accessToken: 'oauth-secret' },
  });
  assert.equal('diagnostics' in created[0], false);
  assert.equal(diagnosticCalls, 0);

  await service.createRequest('user-1', {
    ...baseRequest,
    clientRequestId: 'support-request-789012',
    includeDiagnostics: true,
    clientDiagnostics: { ...validClient, accessToken: 'oauth-secret' },
  });
  assert.equal(diagnosticCalls, 1);
  assert.equal(created[1].diagnostics.version, 1);
  assert.equal(
    JSON.stringify(created[1].diagnostics).includes('oauth-secret'),
    false,
  );
});
