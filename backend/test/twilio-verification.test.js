const assert = require('node:assert/strict');
const test = require('node:test');

const { BadRequestException } = require('@nestjs/common');
const { ConfigService } = require('@nestjs/config');

const { TwilioService } = require('../dist/twilio/twilio.service');

function assertBadRequest(error) {
  assert.ok(error instanceof BadRequestException);
  assert.equal(error.getStatus(), 400);
  return true;
}

test('development fallback rejects an invalid OTP with HTTP 400', async () => {
  const service = new TwilioService(
    new ConfigService({ NODE_ENV: 'development' }),
  );

  await assert.rejects(
    service.verifyOtp('user@example.com', '000000'),
    assertBadRequest,
  );
});

test('Twilio non-approved status is rejected with HTTP 400', async () => {
  const service = new TwilioService(
    new ConfigService({
      NODE_ENV: 'production',
      TWILIO_ACCOUNT_SID: `AC${'0'.repeat(32)}`,
      TWILIO_AUTH_TOKEN: 'test-token',
      TWILIO_VERIFY_SERVICE_SID: `VA${'0'.repeat(32)}`,
    }),
  );

  service.client = {
    verify: {
      v2: {
        services: () => ({
          verificationChecks: {
            create: async () => ({ status: 'pending' }),
          },
        }),
      },
    },
  };

  await assert.rejects(
    service.verifyOtp('user@example.com', '000000'),
    assertBadRequest,
  );
});
