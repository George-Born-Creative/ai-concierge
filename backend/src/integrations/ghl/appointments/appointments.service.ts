import { Injectable } from '@nestjs/common';
import { AppointmentNoteDto, BlockSlotDto, CalendarV3QueryDto, UpdateAppointmentDto } from '../dto/calendar-v3.dto';
import { GhlApiService } from '../shared/ghl-api.service';

@Injectable()
export class AppointmentsService {
  constructor(private readonly api: GhlApiService) {}
  listCalendarEvents(...args: Parameters<GhlApiService['listCalendarEvents']>) { return this.api.listCalendarEvents(...args); }
  createAppointment(...args: Parameters<GhlApiService['createAppointment']>) { return this.api.createAppointment(...args); }
  cancelAppointment(...args: Parameters<GhlApiService['cancelAppointment']>) { return this.api.cancelAppointment(...args); }

  getAppointment(userId: string, id: string) {
    return this.api.ghlRequest<Record<string, unknown>>(userId, 'GET', `/calendars/events/appointments/${id}`);
  }

  updateAppointment(userId: string, id: string, body: UpdateAppointmentDto) {
    return this.api.ghlRequest<Record<string, unknown>>(userId, 'PUT', `/calendars/events/appointments/${id}`, { ...body });
  }

  async listBlockedSlots(userId: string, query: CalendarV3QueryDto) {
    const { locationId } = await this.api.getValidAccessToken(userId);
    if (!locationId) throw new Error('GoHighLevel connection is missing a location');
    const params = new URLSearchParams({ locationId });
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    return this.api.ghlRequest<Record<string, unknown>>(userId, 'GET', `/calendars/blocked-slots?${params.toString()}`);
  }

  async createBlockSlot(userId: string, body: BlockSlotDto) {
    const { locationId } = await this.api.getValidAccessToken(userId);
    if (!locationId) throw new Error('GoHighLevel connection is missing a location');
    return this.api.ghlRequest<Record<string, unknown>>(userId, 'POST', '/calendars/events/block-slots', { locationId, ...body });
  }

  updateBlockSlot(userId: string, id: string, body: BlockSlotDto) {
    return this.api.ghlRequest<Record<string, unknown>>(userId, 'PUT', `/calendars/events/block-slots/${id}`, { ...body });
  }

  listNotes(userId: string, appointmentId: string) {
    return this.api.ghlRequest<Record<string, unknown>>(userId, 'GET', `/calendars/appointments/${appointmentId}/notes`);
  }
  createNote(userId: string, appointmentId: string, body: AppointmentNoteDto) {
    return this.api.ghlRequest<Record<string, unknown>>(userId, 'POST', `/calendars/appointments/${appointmentId}/notes`, { ...body });
  }
  updateNote(userId: string, appointmentId: string, noteId: string, body: AppointmentNoteDto) {
    return this.api.ghlRequest<Record<string, unknown>>(userId, 'PUT', `/calendars/appointments/${appointmentId}/notes/${noteId}`, { ...body });
  }
  deleteNote(userId: string, appointmentId: string, noteId: string) {
    return this.api.ghlRequest<Record<string, unknown>>(userId, 'DELETE', `/calendars/appointments/${appointmentId}/notes/${noteId}`);
  }
}
