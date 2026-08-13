const assert = require('node:assert/strict');
const test = require('node:test');

const { CalendarsService } = require('../dist/integrations/ghl/calendars/calendars.service.js');
const { AppointmentsService } = require('../dist/integrations/ghl/appointments/appointments.service.js');
const { GhlApiService } = require('../dist/integrations/ghl/shared/ghl-api.service.js');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { CreateGhlCalendarDto } = require('../dist/integrations/ghl/dto/create-calendar.dto.js');

function createApi(response = {}) {
  const calls = [];
  return {
    calls,
    getValidAccessToken: async () => ({ accessToken: 'token', locationId: 'location-1' }),
    ghlRequest: async (...args) => {
      calls.push(args);
      return response;
    },
  };
}

test('calendar requests use the v3 version header', async () => {
  const api = Object.create(GhlApiService.prototype);
  api.getValidAccessToken = async () => ({ accessToken: 'token', locationId: 'location-1' });
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, init) => {
    request = { url, init };
    return new Response('{}', { status: 200 });
  };
  try {
    await api.ghlRequest('user-1', 'GET', '/calendars/groups?locationId=location-1');
  } finally {
    global.fetch = originalFetch;
  }
  assert.equal(request.init.headers.Version, 'v3');
});

test('calendar resource reads inject the connected location', async () => {
  const api = createApi({ groups: [] });
  const service = new CalendarsService(api);
  await service.listGroups('user-1', { limit: 25 });
  assert.deepEqual(api.calls[0], [
    'user-1',
    'GET',
    '/calendars/groups?limit=25&locationId=location-1',
    undefined,
  ]);
});

test('calendar resource creates cannot accept a caller location id', async () => {
  const api = createApi({ group: { id: 'group-1' } });
  const service = new CalendarsService(api);
  await service.createGroup('user-1', { name: 'Sales' });
  assert.deepEqual(api.calls[0][3], { name: 'Sales', locationId: 'location-1' });
});

test('calendar DTO validates v3 settings and rejects opaque passthrough fields', async () => {
  const valid = plainToInstance(CreateGhlCalendarDto, {
    name: 'Sales',
    calendarType: 'round_robin',
    slotDuration: 30,
    slotDurationUnit: 'mins',
    allowCancellation: true,
  });
  assert.equal((await validate(valid, { whitelist: true, forbidNonWhitelisted: true })).length, 0);

  const unsafe = plainToInstance(CreateGhlCalendarDto, {
    name: 'Sales',
    locationId: 'someone-elses-location',
    options: { locationId: 'someone-elses-location' },
  });
  const errors = await validate(unsafe, { whitelist: true, forbidNonWhitelisted: true });
  assert.equal(errors.some((error) => error.property === 'locationId'), true);
  assert.equal(errors.some((error) => error.property === 'options'), true);
});

test('availability schedule associations use the documented v3 route', async () => {
  const api = createApi({ success: true });
  const service = new CalendarsService(api);
  await service.applySchedule('user-1', 'schedule-1', 'calendar-1');
  assert.equal(api.calls[0][2], '/calendars/schedules/schedule-1/associations/calendar-1');
  assert.equal(api.calls[0][1], 'PUT');
});

test('appointments expose get, update, block-slot, and note routes', async () => {
  const api = createApi({});
  const service = new AppointmentsService(api);
  await service.getAppointment('user-1', 'event-1');
  await service.updateAppointment('user-1', 'event-1', { appointmentStatus: 'showed' });
  await service.createBlockSlot('user-1', {
    calendarId: 'calendar-1',
    startTime: '2026-08-12T09:00:00Z',
    endTime: '2026-08-12T10:00:00Z',
  });
  await service.createNote('user-1', 'event-1', { body: 'Bring proposal' });

  assert.equal(api.calls[0][2], '/calendars/events/appointments/event-1');
  assert.equal(api.calls[1][1], 'PUT');
  assert.deepEqual(api.calls[2][3], {
    locationId: 'location-1',
    calendarId: 'calendar-1',
    startTime: '2026-08-12T09:00:00Z',
    endTime: '2026-08-12T10:00:00Z',
  });
  assert.equal(api.calls[3][2], '/calendars/appointments/event-1/notes');
});

test('appointment creation books the exact user-requested time', async () => {
  const api = Object.create(GhlApiService.prototype);
  const calls = [];
  api.config = { get: () => 'UTC' };
  api.requireLocationId = async () => 'location-1';
  api.audit = async () => undefined;
  api.ghlRequest = async (...args) => {
    calls.push(args);
    if (args[1] === 'GET') {
      return { calendar: { id: 'calendar-1', name: 'Sales', timezone: 'UTC' } };
    }
    return {
      event: {
        id: 'event-1',
        title: 'Demo',
        calendarId: 'calendar-1',
        contactId: 'contact-1',
        startTime: '2026-08-12T09:00:00Z',
        endTime: '2026-08-12T09:30:00Z',
      },
    };
  };

  await api.createAppointment('user-1', {
    calendarId: 'calendar-1',
    contactId: 'contact-1',
    title: 'Demo',
    startTime: '2026-08-12T09:00:00Z',
  });

  assert.deepEqual(
    calls.map((call) => call[2]),
    ['/calendars/calendar-1', '/calendars/events/appointments'],
  );
  assert.equal(calls[1][3].ignoreDateRange, true);
  assert.equal(calls[1][3].ignoreFreeSlotValidation, true);
});
