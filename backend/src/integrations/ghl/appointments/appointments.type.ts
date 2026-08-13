export type GhlAppointmentSummary = {
  id: string;
  title: string;
  startTime?: string;
  endTime?: string;
  contactId?: string;
  contactName?: string;
  calendarId?: string;
  calendarName?: string;
  ownerId?: string;
  ownerName?: string;
  status?: string;
  description?: string;
  address?: string;
  recurring?: boolean;
};

export type GhlAppointmentsListResult = {
  appointments: GhlAppointmentSummary[];
};

export type GhlBookingConflict = {
  message: string;
  suggestedSlots: string[];
};
