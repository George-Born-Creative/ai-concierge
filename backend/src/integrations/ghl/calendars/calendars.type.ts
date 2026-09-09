export type GhlCalendarSummary = {
  id: string;
  name: string;
  isActive?: boolean;
  description?: string;
  calendarType?: string;
  eventType?: string;
  groupId?: string;
  slug?: string;
  widgetSlug?: string;
  widgetType?: string;
  timezone?: string;
  eventTitle?: string;
  eventColor?: string;
  slotDuration?: number;
  slotDurationUnit?: string;
  slotInterval?: number;
  slotIntervalUnit?: string;
  slotBuffer?: number;
  slotBufferUnit?: string;
  preBuffer?: number;
  preBufferUnit?: string;
  appointmentsPerSlot?: number;
  appointmentsPerDay?: number;
  allowBookingAfter?: number;
  allowBookingAfterUnit?: string;
  allowBookingFor?: number;
  allowBookingForUnit?: string;
  allowReschedule?: boolean;
  allowCancellation?: boolean;
  autoConfirm?: boolean;
  enableRecurring?: boolean;
  meetingLocation?: string;
  teamSummary?: string;
};

export type GhlCalendarsListResult = {
  calendars: GhlCalendarSummary[];
};

export type GhlCalendarPage<T = Record<string, unknown>> = {
  items: T[];
  meta?: Record<string, unknown>;
};
