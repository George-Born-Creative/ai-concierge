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

test('sendOtp matches the working Twilio Verify REST request', async (t) => {
  const accountSid = `AC${'0'.repeat(32)}`;
  const authToken = 'test-token';
  const serviceSid = `VA${'0'.repeat(32)}`;
  const service = new TwilioService(
    new ConfigService({
      NODE_ENV: 'production',
      TWILIO_ACCOUNT_SID: accountSid,
      TWILIO_AUTH_TOKEN: authToken,
      TWILIO_VERIFY_SERVICE_SID: serviceSid,
    }),
  );

  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(
      url,
      `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`,
    );
    assert.equal(options.method, 'POST');
    assert.equal(
      options.headers.Authorization,
      `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
    );

    const form = new URLSearchParams(options.body);
    assert.equal(form.get('To'), 'user@example.com');
    assert.equal(form.get('Channel'), 'email');

    return new Response(
      JSON.stringify({
        sid: `VE${'0'.repeat(32)}`,
        status: 'pending',
        to: 'user@example.com',
        channel: 'email',
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  });

  const result = await service.sendOtp(' USER@example.com ', 'email');
  assert.equal(result.status, 'pending');
  assert.equal(result.to, 'user@example.com');
  assert.equal(result.channel, 'email');
});

test('Twilio non-approved REST status is rejected with HTTP 400', async (t) => {
  const serviceSid = `VA${'0'.repeat(32)}`;
  const service = new TwilioService(
    new ConfigService({
      NODE_ENV: 'production',
      TWILIO_ACCOUNT_SID: `AC${'0'.repeat(32)}`,
      TWILIO_AUTH_TOKEN: 'test-token',
      TWILIO_VERIFY_SERVICE_SID: serviceSid,
    }),
  );

  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(
      url,
      `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`,
    );
    const form = new URLSearchParams(options.body);
    assert.equal(form.get('To'), 'user@example.com');
    assert.equal(form.get('Code'), '000000');

    return new Response(JSON.stringify({ status: 'pending' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  await assert.rejects(
    service.verifyOtp('user@example.com', '000000'),
    assertBadRequest,
  );
});
