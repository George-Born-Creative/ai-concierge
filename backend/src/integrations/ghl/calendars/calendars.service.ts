import { Injectable } from '@nestjs/common';
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
}
