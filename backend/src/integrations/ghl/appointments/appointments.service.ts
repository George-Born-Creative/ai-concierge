import { Injectable } from '@nestjs/common';
import { GhlApiService } from '../shared/ghl-api.service';

@Injectable()
export class AppointmentsService {
  constructor(private readonly api: GhlApiService) {}
  listCalendarEvents(...args: Parameters<GhlApiService['listCalendarEvents']>) { return this.api.listCalendarEvents(...args); }
  createAppointment(...args: Parameters<GhlApiService['createAppointment']>) { return this.api.createAppointment(...args); }
  cancelAppointment(...args: Parameters<GhlApiService['cancelAppointment']>) { return this.api.cancelAppointment(...args); }
}
