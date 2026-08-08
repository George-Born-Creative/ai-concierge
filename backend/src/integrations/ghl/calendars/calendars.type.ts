export type GhlCalendarSummary = {
  id: string;
  name: string;
  isActive?: boolean;
};

export type GhlCalendarsListResult = {
  calendars: GhlCalendarSummary[];
};
