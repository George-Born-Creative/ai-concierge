import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { calendarTypeLabel, GhlCalendarCard } from '@/components/ghl/ghl-calendar-card';
import { Skeleton, SkeletonLines } from '@/components/ui/skeleton';
import { UiControlHeights, UiRadii, UiSpacing, UiTypography } from '@/constants/theme';
import { ghlApi } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import type { GhlAppointmentSummary, GhlCalendarSummary } from '@/lib/api/types';
import { useAppTheme } from '@/lib/theme/theme-provider';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const VISIBLE_CALENDAR_COUNT = 2;

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmed',
  showed: 'Showed',
  noshow: 'No-show',
  cancelled: 'Cancelled',
  canceled: 'Cancelled',
  new: 'New',
  invalid: 'Invalid',
};

type LoadState<T> = {
  data: T[];
  loading: boolean;
  error: string | null;
};

type GhlCalendarViewProps = {
  calendars: LoadState<GhlCalendarSummary>;
  variant?: 'page' | 'preview';
  refreshSignal?: number;
};

function atMidnight(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(date: Date): Date {
  const next = atMidnight(date);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function sameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function parseWhen(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatWeekRange(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  const startMonth = weekStart.toLocaleDateString(undefined, { month: 'short' });
  const endMonth = weekEnd.toLocaleDateString(undefined, { month: 'short' });
  if (weekStart.getMonth() === weekEnd.getMonth()) {
    return `${startMonth} ${weekStart.getDate()} – ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
  }
  return `${startMonth} ${weekStart.getDate()} – ${endMonth} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
}

function formatDayHeading(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatDuration(start: Date, end?: Date | null): string {
  if (!end) return 'None';
  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function statusLabel(status?: string): string {
  const key = status?.trim().toLowerCase();
  if (!key) return 'None';
  return STATUS_LABELS[key] ?? status!.replace(/_/g, ' ');
}

export function GhlCalendarView({
  calendars,
  variant = 'page',
  refreshSignal = 0,
}: GhlCalendarViewProps) {
  const { colors } = useAppTheme();
  const today = useMemo(() => atMidnight(new Date()), []);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => atMidnight(new Date()));
  const [activeCalendarId, setActiveCalendarId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [showMoreCalendars, setShowMoreCalendars] = useState(false);
  const [appointments, setAppointments] = useState<LoadState<GhlAppointmentSummary>>({
    data: [],
    loading: true,
    error: null,
  });

  const weekDays = useMemo(
    () => WEEKDAYS.map((_, index) => addDays(weekStart, index)),
    [weekStart],
  );

  const loadEvents = useCallback(async () => {
    setAppointments((current) => ({ ...current, loading: current.data.length === 0, error: null }));
    try {
      const result = await ghlApi.listCalendarEvents({
        startTime: weekStart.toISOString(),
        endTime: addDays(weekStart, 7).toISOString(),
      });
      setAppointments({ data: result.appointments ?? [], loading: false, error: null });
    } catch (reason) {
      const message =
        reason instanceof ApiError
          ? reason.message
          : reason instanceof Error
            ? reason.message
            : 'Could not load calendar events.';
      setAppointments((current) => ({
        data: current.data,
        loading: false,
        error: message,
      }));
    }
  }, [weekStart]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents, refreshSignal]);

  const calendarById = useMemo(() => {
    const map = new Map<string, GhlCalendarSummary>();
    for (const calendar of calendars.data) map.set(calendar.id, calendar);
    return map;
  }, [calendars.data]);

  const visibleAppointments = useMemo(() => {
    if (!activeCalendarId) return appointments.data;
    return appointments.data.filter((item) => item.calendarId === activeCalendarId);
  }, [activeCalendarId, appointments.data]);

  const countsByDay = useMemo(() => {
    const counts = weekDays.map(() => 0);
    for (const item of visibleAppointments) {
      const start = parseWhen(item.startTime);
      if (!start) continue;
      const index = weekDays.findIndex((day) => sameDay(day, start));
      if (index >= 0) counts[index] += 1;
    }
    return counts;
  }, [visibleAppointments, weekDays]);

  const selectedAppointments = useMemo(() => {
    return visibleAppointments
      .filter((item) => {
        const start = parseWhen(item.startTime);
        return start ? sameDay(start, selectedDay) : false;
      })
      .sort((left, right) => {
        const a = parseWhen(left.startTime)?.getTime() ?? 0;
        const b = parseWhen(right.startTime)?.getTime() ?? 0;
        return a - b;
      });
  }, [visibleAppointments, selectedDay]);

  const previewAppointments = useMemo(() => {
    return visibleAppointments
      .filter((item) => {
        const start = parseWhen(item.startTime);
        return start ? start >= today : false;
      })
      .slice(0, 4);
  }, [visibleAppointments, today]);

  const visibleCalendars = calendars.data.slice(0, VISIBLE_CALENDAR_COUNT);
  const overflowCalendars = calendars.data.slice(VISIBLE_CALENDAR_COUNT);
  const overflowSelected = overflowCalendars.some((calendar) => calendar.id === activeCalendarId);
  const detailsCalendar = calendars.data.find((calendar) => calendar.id === detailsId);
  const listedAppointments = variant === 'preview' ? previewAppointments : selectedAppointments;

  function selectCalendar(calendarId: string | null) {
    setActiveCalendarId(calendarId);
    setDetailsId((current) => (calendarId && current === calendarId ? current : null));
    if (calendarId === null || overflowCalendars.some((calendar) => calendar.id === calendarId)) {
      setShowMoreCalendars(false);
    }
  }

  function shiftWeek(delta: number) {
    const nextStart = addDays(weekStart, delta * 7);
    setWeekStart(nextStart);
    const nextSelected = addDays(selectedDay, delta * 7);
    setSelectedDay(atMidnight(nextSelected));
  }

  function goToday() {
    const now = atMidnight(new Date());
    setWeekStart(startOfWeek(now));
    setSelectedDay(now);
  }

  if (calendars.loading && calendars.data.length === 0) {
    return (
      <View style={[styles.shell, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Skeleton width="40%" height={14} radius={6} />
        <SkeletonLines lines={4} lineHeight={12} gap={8} lastLineWidth="70%" />
      </View>
    );
  }

  if (calendars.error && calendars.data.length === 0) {
    return (
      <View style={[styles.errorCard, { backgroundColor: colors.dangerSurface, borderColor: colors.dangerBorder }]}>
        <MaterialIcons name="error-outline" size={18} color={colors.danger} />
        <Text style={[styles.errorText, { color: colors.danger }]}>{calendars.error}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.shell, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.toolbar}>
        <Pressable
          accessibilityLabel="Previous week"
          hitSlop={8}
          onPress={() => shiftWeek(-1)}
          style={[styles.navButton, { borderColor: colors.border }]}>
          <MaterialIcons name="chevron-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.toolbarCopy}>
          <Text style={[styles.weekLabel, { color: colors.textPrimary }]}>
            {formatWeekRange(weekStart)}
          </Text>
          <Text style={[styles.toolbarHint, { color: colors.textSecondary }]}>
            {activeCalendarId
              ? calendarById.get(activeCalendarId)?.name || 'Selected calendar'
              : 'All calendars'}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Next week"
          hitSlop={8}
          onPress={() => shiftWeek(1)}
          style={[styles.navButton, { borderColor: colors.border }]}>
          <MaterialIcons name="chevron-right" size={22} color={colors.textPrimary} />
        </Pressable>
        <Pressable
          onPress={goToday}
          style={[styles.todayButton, { backgroundColor: colors.primaryMuted }]}>
          <Text style={[styles.todayText, { color: colors.primary }]}>Today</Text>
        </Pressable>
      </View>

      {calendars.data.length > 0 ? (
        <View style={styles.calendarPicker}>
          <View style={styles.chipRow}>
            {visibleCalendars.map((calendar) => {
              const selected = activeCalendarId === calendar.id;
              const accent = calendar.eventColor?.trim() || colors.primary;
              return (
                <Pressable
                  key={calendar.id}
                  onPress={() => selectCalendar(calendar.id)}
                  onLongPress={() => setDetailsId(calendar.id)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? colors.primaryMuted : colors.surfaceMuted,
                      borderColor: selected ? accent : colors.border,
                    },
                  ]}>
                  <View style={[styles.chipDot, { backgroundColor: accent }]} />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.chipText,
                      { color: selected ? colors.textPrimary : colors.textSecondary, flex: 1 },
                    ]}>
                    {calendar.name || 'None'}
                  </Text>
                </Pressable>
              );
            })}
            {visibleCalendars.length === 1 ? <View style={styles.chipSpacer} /> : null}
            {overflowCalendars.length > 0 ? (
              <Pressable
                accessibilityLabel="More calendars"
                onPress={() => setShowMoreCalendars((open) => !open)}
                style={[
                  styles.moreButton,
                  {
                    backgroundColor: overflowSelected || showMoreCalendars
                      ? colors.primaryMuted
                      : colors.surfaceMuted,
                    borderColor: overflowSelected || showMoreCalendars ? colors.primary : colors.border,
                  },
                ]}>
                <MaterialIcons
                  name={showMoreCalendars ? 'expand-less' : 'more-horiz'}
                  size={20}
                  color={overflowSelected || showMoreCalendars ? colors.primary : colors.textSecondary}
                />
              </Pressable>
            ) : null}
          </View>

          {overflowCalendars.length > 0 && showMoreCalendars ? (
            <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                style={styles.dropdownList}>
                <Pressable
                  onPress={() => selectCalendar(null)}
                  style={[
                    styles.dropdownItem,
                    !activeCalendarId && { backgroundColor: colors.primaryMuted },
                  ]}>
                  <Text
                    style={[
                      styles.chipText,
                      { color: !activeCalendarId ? colors.primary : colors.textPrimary },
                    ]}>
                    All calendars
                  </Text>
                </Pressable>
                {overflowCalendars.map((calendar) => {
                  const selected = activeCalendarId === calendar.id;
                  const accent = calendar.eventColor?.trim() || colors.primary;
                  return (
                    <Pressable
                      key={calendar.id}
                      onPress={() => selectCalendar(calendar.id)}
                      onLongPress={() => setDetailsId(calendar.id)}
                      style={[
                        styles.dropdownItem,
                        selected && { backgroundColor: colors.primaryMuted },
                      ]}>
                      <View style={[styles.chipDot, { backgroundColor: accent }]} />
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.chipText,
                          { color: selected ? colors.textPrimary : colors.textSecondary, flex: 1 },
                        ]}>
                        {calendar.name || 'None'}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : overflowCalendars.length === 0 ? (
            <Pressable onPress={() => selectCalendar(null)} style={styles.allLink}>
              <Text
                style={[
                  styles.chipText,
                  { color: !activeCalendarId ? colors.primary : colors.textSecondary },
                ]}>
                All calendars
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={[styles.emptyCalendars, { color: colors.textSecondary }]}>
          No calendars in your GoHighLevel account yet.
        </Text>
      )}

      <View style={styles.weekStrip}>
        {weekDays.map((day, index) => {
          const selected = sameDay(day, selectedDay);
          const isToday = sameDay(day, today);
          return (
            <Pressable
              key={day.toISOString()}
              onPress={() => setSelectedDay(day)}
              style={[
                styles.dayCell,
                selected && { backgroundColor: colors.primary, borderColor: colors.primary },
                !selected && isToday && { borderColor: colors.primary },
                !selected && { borderColor: colors.border },
              ]}>
              <Text
                style={[
                  styles.dayName,
                  { color: selected ? colors.onPrimary : colors.textSecondary },
                ]}>
                {WEEKDAYS[index]}
              </Text>
              <Text
                style={[
                  styles.dayNumber,
                  { color: selected ? colors.onPrimary : colors.textPrimary },
                ]}>
                {day.getDate()}
              </Text>
              <View style={styles.dots}>
                {Array.from({ length: Math.min(countsByDay[index], 3) }).map((_, dot) => (
                  <View
                    key={dot}
                    style={[
                      styles.dot,
                      { backgroundColor: selected ? colors.onPrimary : colors.primary },
                    ]}
                  />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      {activeCalendarId ? (
        <Pressable
          onPress={() => setDetailsId((current) => (current === activeCalendarId ? null : activeCalendarId))}
          style={styles.detailsToggle}>
          <Text style={[styles.detailsToggleText, { color: colors.primary }]}>
            {detailsId === activeCalendarId ? 'Hide calendar settings' : 'Show calendar settings'}
          </Text>
          <MaterialIcons
            name={detailsId === activeCalendarId ? 'expand-less' : 'expand-more'}
            size={18}
            color={colors.primary}
          />
        </Pressable>
      ) : null}

      {detailsCalendar ? (
        <View style={[styles.detailsCard, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
          <Text style={[styles.detailsTitle, { color: colors.textPrimary }]}>
            {detailsCalendar.name || 'None'}
          </Text>
          <Text style={[styles.detailsMeta, { color: colors.textSecondary }]}>
            {calendarTypeLabel(detailsCalendar.calendarType)}
          </Text>
          <GhlCalendarCard calendar={detailsCalendar} />
        </View>
      ) : null}

      <View style={styles.agendaHeader}>
        <Text style={[styles.agendaTitle, { color: colors.textPrimary }]}>
          {variant === 'preview' ? 'Upcoming this week' : formatDayHeading(selectedDay)}
        </Text>
        <Text style={[styles.agendaCount, { color: colors.textMuted }]}>
          {listedAppointments.length} {listedAppointments.length === 1 ? 'event' : 'events'}
        </Text>
      </View>

      {appointments.loading && appointments.data.length === 0 ? (
        <SkeletonLines lines={3} lineHeight={14} gap={10} lastLineWidth="55%" />
      ) : appointments.error && appointments.data.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.danger }]}>{appointments.error}</Text>
      ) : listedAppointments.length === 0 ? (
        <View style={[styles.emptyDay, { backgroundColor: colors.surfaceMuted }]}>
          <MaterialIcons name="event-available" size={22} color={colors.iconMuted} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No appointments {variant === 'preview' ? 'this week' : 'on this day'}.
          </Text>
        </View>
      ) : (
        listedAppointments.map((item) => {
          const start = parseWhen(item.startTime);
          const end = parseWhen(item.endTime);
          const calendar = item.calendarId ? calendarById.get(item.calendarId) : undefined;
          const accent = calendar?.eventColor?.trim() || colors.primary;
          return (
            <View
              key={item.id}
              style={[styles.eventCard, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
              <View style={[styles.eventAccent, { backgroundColor: accent }]} />
              <View style={styles.eventBody}>
                <View style={styles.eventTop}>
                  <Text style={[styles.eventTime, { color: colors.primary }]}>
                    {start ? formatTime(start) : 'None'}
                    {end ? ` – ${formatTime(end)}` : ''}
                  </Text>
                  <Text style={[styles.eventDuration, { color: colors.textMuted }]}>
                    {start ? formatDuration(start, end) : 'None'}
                  </Text>
                </View>
                <Text style={[styles.eventTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                  {item.title?.trim() || 'None'}
                </Text>
                <Text style={[styles.eventMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                  {[item.contactName || 'None', calendar?.name || item.calendarName || 'None']
                    .join(' · ')}
                </Text>
                <View style={styles.eventFooter}>
                  <Text style={[styles.eventLabel, { color: colors.textMuted }]}>Status</Text>
                  <Text style={[styles.eventStatus, { color: colors.textPrimary }]}>
                    {statusLabel(item.status)}
                  </Text>
                  <Text style={[styles.eventLabel, { color: colors.textMuted }]}>Owner</Text>
                  <Text style={[styles.eventStatus, { color: colors.textPrimary }]}>
                    {item.ownerName?.trim() || 'None'}
                  </Text>
                </View>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: UiRadii.card,
    borderWidth: 1,
    gap: UiSpacing.md,
    overflow: 'hidden',
    padding: UiSpacing.md,
  },
  toolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: UiSpacing.sm,
  },
  navButton: {
    alignItems: 'center',
    borderRadius: UiRadii.control,
    borderWidth: 1,
    height: UiControlHeights.iconButton,
    justifyContent: 'center',
    width: UiControlHeights.iconButton,
  },
  toolbarCopy: {
    flex: 1,
    gap: 2,
  },
  weekLabel: {
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  toolbarHint: {
    fontSize: UiTypography.caption.fontSize,
    lineHeight: UiTypography.caption.lineHeight,
  },
  todayButton: {
    borderRadius: UiRadii.pill,
    paddingHorizontal: UiSpacing.md,
    paddingVertical: UiSpacing.xs,
  },
  todayText: {
    fontSize: UiTypography.label.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.label.lineHeight,
  },
  calendarPicker: {
    gap: UiSpacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    gap: UiSpacing.sm,
  },
  chip: {
    alignItems: 'center',
    borderRadius: UiRadii.pill,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    minWidth: 0,
    paddingHorizontal: UiSpacing.md,
    paddingVertical: 6,
  },
  chipSpacer: {
    flex: 1,
  },
  chipDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  chipText: {
    flexShrink: 1,
    fontSize: UiTypography.label.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.label.lineHeight,
  },
  moreButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: UiRadii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    width: 36,
  },
  dropdown: {
    borderRadius: UiRadii.control,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownList: {
    maxHeight: 240,
  },
  dropdownItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: UiSpacing.md,
    paddingVertical: UiSpacing.sm,
  },
  allLink: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  emptyCalendars: {
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
  },
  weekStrip: {
    flexDirection: 'row',
    gap: 4,
  },
  dayCell: {
    alignItems: 'center',
    borderRadius: UiRadii.control,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    paddingVertical: UiSpacing.sm,
  },
  dayName: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    lineHeight: 12,
    textTransform: 'uppercase',
  },
  dayNumber: {
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  dots: {
    flexDirection: 'row',
    gap: 2,
    height: 6,
    justifyContent: 'center',
    minHeight: 6,
  },
  dot: {
    borderRadius: 3,
    height: 4,
    width: 4,
  },
  detailsToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailsToggleText: {
    fontSize: UiTypography.label.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.label.lineHeight,
  },
  detailsCard: {
    borderRadius: UiRadii.card,
    borderWidth: 1,
    padding: UiSpacing.md,
  },
  detailsTitle: {
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  detailsMeta: {
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
    marginBottom: 2,
  },
  agendaHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: UiSpacing.sm,
  },
  agendaTitle: {
    flex: 1,
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  agendaCount: {
    fontSize: UiTypography.caption.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.caption.lineHeight,
  },
  emptyDay: {
    alignItems: 'center',
    borderRadius: UiRadii.card,
    gap: UiSpacing.sm,
    paddingVertical: UiSpacing.xl,
  },
  emptyText: {
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
    textAlign: 'center',
  },
  eventCard: {
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  eventAccent: {
    width: 4,
  },
  eventBody: {
    flex: 1,
    gap: 2,
    padding: UiSpacing.md,
  },
  eventTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eventTime: {
    fontSize: UiTypography.label.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.label.lineHeight,
  },
  eventDuration: {
    fontSize: UiTypography.caption.fontSize,
    lineHeight: UiTypography.caption.lineHeight,
  },
  eventTitle: {
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  eventMeta: {
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
  },
  eventFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  eventLabel: {
    fontSize: UiTypography.caption.fontSize,
    fontWeight: '600',
    letterSpacing: 0.2,
    lineHeight: UiTypography.caption.lineHeight,
    textTransform: 'uppercase',
  },
  eventStatus: {
    fontSize: UiTypography.caption.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.caption.lineHeight,
    marginRight: UiSpacing.sm,
  },
  errorCard: {
    alignItems: 'flex-start',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    padding: UiSpacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
  },
});
