export type GhlCalendarSummary = {
  id: string;
  name: string;
  isActive?: boolean;
  description?: string;
  calendarType?: string;
  groupId?: string;
  slug?: string;
  timezone?: string;
  slotDuration?: number;
  slotDurationUnit?: string;
  slotInterval?: number;
  slotIntervalUnit?: string;
  allowReschedule?: boolean;
  allowCancellation?: boolean;
};

export type GhlCalendarsListResult = {
  calendars: GhlCalendarSummary[];
};

export type GhlCalendarPage<T = Record<string, unknown>> = {
  items: T[];
  meta?: Record<string, unknown>;
};
