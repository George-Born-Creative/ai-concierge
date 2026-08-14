const assert = require('node:assert/strict');
const test = require('node:test');

const {
  looksLikeCapabilityQuestion,
  VOICE_ASSISTANT_CAPABILITIES_RESPONSE,
} = require('../dist/assistant/assistant-capabilities.js');
const {
  AssistantCommandService,
} = require('../dist/assistant/assistant-command.service.js');

test('recognizes common requests for the complete voice capability list', () => {
  for (const prompt of [
    'What can the app do?',
    'What can you do',
    'Show me all your functions',
    'Tell me every feature',
    'Everything the voice assistant can do',
    'voice commands',
    'help',
  ]) {
    assert.equal(looksLikeCapabilityQuestion(prompt), true, prompt);
  }
  assert.equal(looksLikeCapabilityQuestion('Show my contacts'), false);
  assert.equal(looksLikeCapabilityQuestion('What can I do with this contact?'), false);
});

test('catalog includes every implemented voice-assistant resource group', () => {
  for (const capability of [
    'Contacts',
    'Calendars',
    'Availability and appointments',
    'Pipelines and opportunities',
    'Conversations and messaging',
    'Deals',
    'Companies',
    'Tickets',
    'Products',
    'Orders',
    'CRM assistance',
  ]) {
    assert.match(VOICE_ASSISTANT_CAPABILITIES_RESPONSE, new RegExp(capability, 'i'));
  }
});

test('catalog states important HubSpot limitations without hiding deal support', () => {
  assert.doesNotMatch(VOICE_ASSISTANT_CAPABILITIES_RESPONSE, /HubSpot deal editing/i);
  assert.match(VOICE_ASSISTANT_CAPABILITIES_RESPONSE, /HubSpot calendars/i);
  assert.match(VOICE_ASSISTANT_CAPABILITIES_RESPONSE, /not currently available/i);
});

test('command service returns the catalog unchanged as a deterministic success', () => {
  const service = new AssistantCommandService({}, {}, {}, {}, {});
  assert.deepEqual(service.describeCapabilities(), {
    response: VOICE_ASSISTANT_CAPABILITIES_RESPONSE,
    status: 'success',
    preservePendingIntent: true,
  });
});
