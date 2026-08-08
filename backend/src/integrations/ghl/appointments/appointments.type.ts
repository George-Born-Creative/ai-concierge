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
};

export type GhlAppointmentsListResult = {
  appointments: GhlAppointmentSummary[];
};
