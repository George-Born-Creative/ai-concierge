const assert = require('node:assert/strict');
const test = require('node:test');

const {
  NORMALIZER_SYSTEM_PROMPT,
  VoiceService,
  WHISPER_PROMPT,
} = require('../dist/voice/voice.service.js');
const { AssistantService } = require('../dist/assistant/assistant.service.js');

test('speech recognition is primed for both CRMs and the complete command vocabulary', () => {
  assert.match(WHISPER_PROMPT, /GoHighLevel/);
  assert.match(WHISPER_PROMPT, /HubSpot/);
  for (const term of [
    'contacts',
    'companies',
    'deals',
    'opportunities',
    'pipelines',
    'tickets',
    'products',
    'orders',
    'associations',
  ]) {
    assert.match(WHISPER_PROMPT, new RegExp(`\\b${term}\\b`, 'i'));
  }
});

test('intent normalization is CRM-neutral and maps deal language consistently', () => {
  assert.match(NORMALIZER_SYSTEM_PROMPT, /supports both GoHighLevel \(GHL\) and HubSpot/);
  assert.match(NORMALIZER_SYSTEM_PROMPT, /provider-neutral CRM language/);
  assert.match(NORMALIZER_SYSTEM_PROMPT, /A "deal" may be called an "opportunity"/);
});

test('assistant corrects voice grammar when the caller did not supply corrected text', async () => {
  const correctionCalls = [];
  const persisted = [];
  const prisma = {
    assistantConversation: {
      findFirst: async () => ({ id: 'conversation-1', title: null, context: null }),
      update: async () => ({}),
    },
    assistantMessage: {
      create: async ({ data }) => {
        persisted.push(data);
        return { id: 'message-1' };
      },
      findMany: async () => [],
    },
  };
  const voice = {
    correctTranscript: async (...args) => {
      correctionCalls.push(args);
      return 'Create a HubSpot deal called Website Redesign.';
    },
    interpretWithContext: async () => ({
      intent: 'unknown',
      confidence: 0,
      entities: {},
      needs_clarification: false,
      notes: null,
    }),
  };
  const service = new AssistantService(prisma, {}, voice, {});

  const prepared = await service.prepareCommand('user-1', 'conversation-1', {
    text: 'create hub spot dill call website redesign',
    source: 'voice',
    rawTranscript: 'create hub spot dill call website redesign',
  });

  assert.deepEqual(correctionCalls, [
    ['user-1', 'create hub spot dill call website redesign'],
  ]);
  assert.equal(prepared.text, 'Create a HubSpot deal called Website Redesign.');
  assert.equal(persisted[0].command, prepared.text);
  assert.equal(persisted[0].correctedTranscript, prepared.text);
});

test('assistant keeps an already-corrected voice transcript without a second model call', async () => {
  let correctionCount = 0;
  const prisma = {
    assistantConversation: {
      findFirst: async () => ({ id: 'conversation-1', title: null, context: null }),
      update: async () => ({}),
    },
    assistantMessage: {
      create: async () => ({ id: 'message-1' }),
      findMany: async () => [],
    },
  };
  const voice = {
    correctTranscript: async () => {
      correctionCount += 1;
      return 'unexpected';
    },
    interpretWithContext: async () => ({
      intent: 'unknown',
      confidence: 0,
      entities: {},
      needs_clarification: false,
      notes: null,
    }),
  };
  const service = new AssistantService(prisma, {}, voice, {});

  const prepared = await service.prepareCommand('user-1', 'conversation-1', {
    text: 'Create a contact named Jane.',
    source: 'voice',
    rawTranscript: 'create contact name jane',
    correctedTranscript: 'Create a contact named Jane.',
  });

  assert.equal(correctionCount, 0);
  assert.equal(prepared.text, 'Create a contact named Jane.');
});

test('voice service exposes the same grammar corrector used after transcription', async () => {
  const calls = [];
  const grammar = {
    correctGrammar: async (...args) => {
      calls.push(args);
      return 'List my HubSpot deals.';
    },
  };
  const service = new VoiceService({}, {}, {}, grammar);

  assert.equal(
    await service.correctTranscript('user-1', 'list my hub spot dills'),
    'List my HubSpot deals.',
  );
  assert.deepEqual(calls, [['list my hub spot dills', 'user-1']]);
});
