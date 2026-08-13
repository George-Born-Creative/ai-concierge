import { Injectable } from '@nestjs/common';
import { CalendarV3PayloadDto, CalendarV3QueryDto } from '../dto/calendar-v3.dto';
import { GhlApiService } from '../shared/ghl-api.service';

@Injectable()
export class CalendarsService {
  constructor(private readonly api: GhlApiService) {}
  listCalendars(...args: Parameters<GhlApiService['listCalendars']>) { return this.api.listCalendars(...args); }
  getCalendar(...args: Parameters<GhlApiService['getCalendar']>) { return this.api.getCalendar(...args); }
  createCalendar(...args: Parameters<GhlApiService['createCalendar']>) { return this.api.createCalendar(...args); }
  updateCalendar(...args: Parameters<GhlApiService['updateCalendar']>) { return this.api.updateCalendar(...args); }
  deleteCalendar(...args: Parameters<GhlApiService['deleteCalendar']>) { return this.api.deleteCalendar(...args); }
  getCalendarFreeSlots(...args: Parameters<GhlApiService['getCalendarFreeSlots']>) { return this.api.getCalendarFreeSlots(...args); }

  listGroups(userId: string, query: CalendarV3QueryDto) { return this.request(userId, 'GET', '/calendars/groups', undefined, query); }
  createGroup(userId: string, body: CalendarV3PayloadDto) { return this.request(userId, 'POST', '/calendars/groups', body, undefined, true); }
  validateGroupSlug(userId: string, body: CalendarV3PayloadDto) { return this.request(userId, 'POST', '/calendars/groups/validate-slug', body, undefined, true); }
  updateGroup(userId: string, id: string, body: CalendarV3PayloadDto) { return this.request(userId, 'PUT', `/calendars/groups/${id}`, body); }
  setGroupStatus(userId: string, id: string, body: CalendarV3PayloadDto) { return this.request(userId, 'PUT', `/calendars/groups/${id}/status`, body); }
  deleteGroup(userId: string, id: string) { return this.request(userId, 'DELETE', `/calendars/groups/${id}`); }

  listSchedules(userId: string, query: CalendarV3QueryDto) { return this.request(userId, 'GET', '/calendars/schedules/search', undefined, query); }
  getSchedule(userId: string, id: string) { return this.request(userId, 'GET', `/calendars/schedules/${id}`); }
  createSchedule(userId: string, body: CalendarV3PayloadDto) { return this.request(userId, 'POST', '/calendars/schedules', body, undefined, true); }
  updateSchedule(userId: string, id: string, body: CalendarV3PayloadDto) { return this.request(userId, 'PUT', `/calendars/schedules/${id}`, body); }
  deleteSchedule(userId: string, id: string) { return this.request(userId, 'DELETE', `/calendars/schedules/${id}`); }
  applySchedule(userId: string, id: string, calendarId: string) { return this.request(userId, 'PUT', `/calendars/schedules/${id}/associations/${calendarId}`); }
  removeSchedule(userId: string, id: string, calendarId: string) { return this.request(userId, 'DELETE', `/calendars/schedules/${id}/associations/${calendarId}`); }
  createEventSchedule(userId: string, calendarId: string, body: CalendarV3PayloadDto) { return this.request(userId, 'POST', `/calendars/schedules/event-calendar/${calendarId}`, body); }
  getEventSchedule(userId: string, calendarId: string) { return this.request(userId, 'GET', `/calendars/schedules/event-calendar/${calendarId}`); }
  updateEventSchedule(userId: string, calendarId: string, body: CalendarV3PayloadDto) { return this.request(userId, 'PUT', `/calendars/schedules/event-calendar/${calendarId}`, body); }

  listNotifications(userId: string, calendarId: string, query: CalendarV3QueryDto) { return this.request(userId, 'GET', `/calendars/${calendarId}/notifications`, undefined, query); }
  createNotifications(userId: string, calendarId: string, body: CalendarV3PayloadDto) { return this.request(userId, 'POST', `/calendars/${calendarId}/notifications`, body); }
  getNotification(userId: string, calendarId: string, id: string) { return this.request(userId, 'GET', `/calendars/${calendarId}/notifications/${id}`); }
  updateNotification(userId: string, calendarId: string, id: string, body: CalendarV3PayloadDto) { return this.request(userId, 'PUT', `/calendars/${calendarId}/notifications/${id}`, body); }
  deleteNotification(userId: string, calendarId: string, id: string) { return this.request(userId, 'DELETE', `/calendars/${calendarId}/notifications/${id}`); }

  listServices(userId: string, query: CalendarV3QueryDto) { return this.request(userId, 'GET', '/calendars/services/catalog', undefined, query); }
  createService(userId: string, body: CalendarV3PayloadDto) { return this.request(userId, 'POST', '/calendars/services/catalog', body, undefined, true); }
  getService(userId: string, id: string) { return this.request(userId, 'GET', `/calendars/services/catalog/${id}`); }
  updateService(userId: string, id: string, body: CalendarV3PayloadDto) { return this.request(userId, 'PUT', `/calendars/services/catalog/${id}`, body); }
  deleteService(userId: string, id: string) { return this.request(userId, 'DELETE', `/calendars/services/catalog/${id}`); }

  listServiceLocations(userId: string, query: CalendarV3QueryDto) { return this.request(userId, 'GET', '/calendars/services/locations', undefined, query); }
  createServiceLocation(userId: string, body: CalendarV3PayloadDto) { return this.request(userId, 'POST', '/calendars/services/locations', body, undefined, true); }
  getServiceLocation(userId: string, id: string) { return this.request(userId, 'GET', `/calendars/services/locations/${id}`); }
  updateServiceLocation(userId: string, id: string, body: CalendarV3PayloadDto) { return this.request(userId, 'PUT', `/calendars/services/locations/${id}`, body); }
  deleteServiceLocation(userId: string, id: string) { return this.request(userId, 'DELETE', `/calendars/services/locations/${id}`); }

  listServiceBookings(userId: string, query: CalendarV3QueryDto) { return this.request(userId, 'GET', '/calendars/services/bookings', undefined, query); }
  createServiceBooking(userId: string, body: CalendarV3PayloadDto) { return this.request(userId, 'POST', '/calendars/services/bookings', body, undefined, true); }
  getServiceBooking(userId: string, id: string) { return this.request(userId, 'GET', `/calendars/services/bookings/${id}`); }
  updateServiceBooking(userId: string, id: string, body: CalendarV3PayloadDto) { return this.request(userId, 'PUT', `/calendars/services/bookings/${id}`, body); }
  deleteServiceBooking(userId: string, id: string) { return this.request(userId, 'DELETE', `/calendars/services/bookings/${id}`); }

  assistantResource(
    userId: string,
    resource: string,
    action: string,
    id: string | undefined,
    calendarId: string | undefined,
    body: CalendarV3PayloadDto,
  ): Promise<Record<string, unknown>> {
    const key = `${resource}:${action}`;
    switch (key) {
      case 'groups:list': return this.listGroups(userId, {});
      case 'groups:create': return this.createGroup(userId, body);
      case 'groups:update': return this.updateGroup(userId, this.requireId(id), body);
      case 'groups:delete': return this.deleteGroup(userId, this.requireId(id));
      case 'schedules:list': return this.listSchedules(userId, {});
      case 'schedules:create': return this.createSchedule(userId, body);
      case 'schedules:update': return this.updateSchedule(userId, this.requireId(id), body);
      case 'schedules:delete': return this.deleteSchedule(userId, this.requireId(id));
      case 'services:list': return this.listServices(userId, {});
      case 'services:create': return this.createService(userId, body);
      case 'services:update': return this.updateService(userId, this.requireId(id), body);
      case 'services:delete': return this.deleteService(userId, this.requireId(id));
      case 'service_locations:list': return this.listServiceLocations(userId, {});
      case 'service_locations:create': return this.createServiceLocation(userId, body);
      case 'service_locations:update': return this.updateServiceLocation(userId, this.requireId(id), body);
      case 'service_locations:delete': return this.deleteServiceLocation(userId, this.requireId(id));
      case 'service_bookings:list': return this.listServiceBookings(userId, {});
      case 'service_bookings:create': return this.createServiceBooking(userId, body);
      case 'service_bookings:update': return this.updateServiceBooking(userId, this.requireId(id), body);
      case 'service_bookings:delete': return this.deleteServiceBooking(userId, this.requireId(id));
      case 'notifications:list': return this.listNotifications(userId, this.requireId(calendarId), {});
      case 'notifications:create': return this.createNotifications(userId, this.requireId(calendarId), body);
      case 'notifications:update': return this.updateNotification(userId, this.requireId(calendarId), this.requireId(id), body);
      case 'notifications:delete': return this.deleteNotification(userId, this.requireId(calendarId), this.requireId(id));
      default: throw new Error(`Unsupported calendar resource action: ${key}`);
    }
  }

  private requireId(value?: string): string {
    if (!value?.trim()) throw new Error('This calendar action needs an id');
    return value.trim();
  }

  private async request(
    userId: string,
    method: string,
    path: string,
    body?: CalendarV3PayloadDto,
    query?: CalendarV3QueryDto,
    includeLocationInBody = false,
  ): Promise<Record<string, unknown>> {
    const { locationId } = await this.api.getValidAccessToken(userId);
    if (!locationId) throw new Error('GoHighLevel connection is missing a location');
    const params = new URLSearchParams();
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) params.set(key, String(value));
      }
    }
    if (method === 'GET') params.set('locationId', locationId);
    const suffix = params.size ? `?${params.toString()}` : '';
    const payload = body ? { ...body } as Record<string, unknown> : undefined;
    if (payload && includeLocationInBody) payload.locationId = locationId;
    return this.api.ghlRequest<Record<string, unknown>>(userId, method, `${path}${suffix}`, payload);
  }
}
