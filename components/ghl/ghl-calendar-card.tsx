import { StyleSheet, Text, View } from 'react-native';

import { UiSpacing, UiTypography } from '@/constants/theme';
import type { GhlCalendarSummary } from '@/lib/api/types';
import { useAppTheme } from '@/lib/theme/theme-provider';

const EMPTY = 'None';

const CALENDAR_TYPE_LABELS: Record<string, string> = {
  round_robin: 'Round robin',
  event: 'Event',
  class_booking: 'Class',
  collective: 'Collective',
  service_booking: 'Service',
  personal: 'Personal',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  RoundRobin_OptimizeForAvailability: 'Optimize for availability',
  RoundRobin_OptimizeForEqualDistribution: 'Optimize for equal distribution',
};

const WIDGET_TYPE_LABELS: Record<string, string> = {
  default: 'Default',
  classic: 'Classic',
};

const UNIT_LABELS: Record<string, string> = {
  mins: 'min',
  hours: 'hours',
  days: 'days',
  weeks: 'weeks',
  months: 'months',
};

function displayText(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : EMPTY;
}

function displayHtml(value?: string | null): string {
  const text = value
    ?.replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text : EMPTY;
}

function displayBool(value?: boolean): string {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return EMPTY;
}

function displayAmount(value?: number, unit?: string): string {
  if (value == null || Number.isNaN(value)) return EMPTY;
  const suffix = unit?.trim();
  if (!suffix) return String(value);
  return `${value} ${UNIT_LABELS[suffix] ?? suffix}`;
}

function displayMapped(value?: string, labels?: Record<string, string>): string {
  const trimmed = value?.trim();
  if (!trimmed) return EMPTY;
  return labels?.[trimmed] ?? trimmed.replace(/_/g, ' ');
}

function displayStatus(isActive?: boolean): string {
  if (isActive === false) return 'Inactive';
  if (isActive === true) return 'Active';
  return EMPTY;
}

type GhlCalendarCardProps = {
  calendar: GhlCalendarSummary;
};

export function calendarTypeLabel(value?: string): string {
  return displayMapped(value, CALENDAR_TYPE_LABELS);
}

export function GhlCalendarCard({ calendar }: GhlCalendarCardProps) {
  const { colors } = useAppTheme();
  const details = [
    { label: 'Name', value: displayText(calendar.name) },
    { label: 'Status', value: displayStatus(calendar.isActive) },
    { label: 'Calendar type', value: displayMapped(calendar.calendarType, CALENDAR_TYPE_LABELS) },
    { label: 'Event type', value: displayMapped(calendar.eventType, EVENT_TYPE_LABELS) },
    { label: 'Description', value: displayHtml(calendar.description) },
    { label: 'Timezone', value: displayText(calendar.timezone) },
    { label: 'Slug', value: displayText(calendar.slug) },
    { label: 'Widget slug', value: displayText(calendar.widgetSlug) },
    { label: 'Widget type', value: displayMapped(calendar.widgetType, WIDGET_TYPE_LABELS) },
    { label: 'Group', value: displayText(calendar.groupId) },
    { label: 'Event title', value: displayText(calendar.eventTitle) },
    { label: 'Event color', value: displayText(calendar.eventColor) },
    { label: 'Slot duration', value: displayAmount(calendar.slotDuration, calendar.slotDurationUnit) },
    { label: 'Slot interval', value: displayAmount(calendar.slotInterval, calendar.slotIntervalUnit) },
    { label: 'Buffer', value: displayAmount(calendar.slotBuffer, calendar.slotBufferUnit) },
    { label: 'Pre-buffer', value: displayAmount(calendar.preBuffer, calendar.preBufferUnit) },
    { label: 'Appointments per slot', value: displayAmount(calendar.appointmentsPerSlot) },
    { label: 'Appointments per day', value: displayAmount(calendar.appointmentsPerDay) },
    { label: 'Book after', value: displayAmount(calendar.allowBookingAfter, calendar.allowBookingAfterUnit) },
    { label: 'Book up to', value: displayAmount(calendar.allowBookingFor, calendar.allowBookingForUnit) },
    { label: 'Allow reschedule', value: displayBool(calendar.allowReschedule) },
    { label: 'Allow cancellation', value: displayBool(calendar.allowCancellation) },
    { label: 'Auto confirm', value: displayBool(calendar.autoConfirm) },
    { label: 'Recurring', value: displayBool(calendar.enableRecurring) },
    { label: 'Team members', value: displayText(calendar.teamSummary) },
    { label: 'Meeting location', value: displayText(calendar.meetingLocation) },
  ];

  return (
    <View style={[styles.grid, { borderTopColor: colors.border }]}>
      {details.map((detail) => (
        <View key={detail.label} style={styles.cell}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{detail.label}</Text>
          <Text
            selectable
            style={[
              styles.value,
              { color: detail.value === EMPTY ? colors.textMuted : colors.textPrimary },
            ]}>
            {detail.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: UiSpacing.sm,
    paddingTop: UiSpacing.sm,
  },
  cell: {
    paddingBottom: UiSpacing.sm,
    paddingRight: UiSpacing.md,
    width: '50%',
  },
  label: {
    fontSize: UiTypography.caption.fontSize,
    fontWeight: '600',
    letterSpacing: 0.2,
    lineHeight: UiTypography.caption.lineHeight,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
  },
});
