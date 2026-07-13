import { Platform } from "react-native";

import type { GhlAppointmentSummary, Reminder } from "../api/types";

// On-device scheduled notifications for reminders. This is the reliable alarm:
// unlike remote push (which needs FCM/APNs credentials and a live server), a
// locally-scheduled notification fires with sound even offline, as long as the
// app has been opened at least once to schedule it.
//
// Local scheduled notifications DO work in Expo Go (SDK 53+ only removes remote
// push token support), so we run everywhere except web.

type NotificationsModule = typeof import("expo-notifications");

let cachedNotifications: NotificationsModule | null = null;
let setupDone = false;

function loadNotifications(): NotificationsModule {
  if (!cachedNotifications) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy load defers the module's import-time work until first use
    cachedNotifications = require("expo-notifications") as NotificationsModule;
  }
  return cachedNotifications;
}

// Reminder statuses that should have a pending on-device notification. Mirrors
// the backend's ACTIVE_STATUSES.
const ACTIVE = new Set(["SCHEDULED", "SNOOZED"]);

// GoHighLevel appointments are scheduled directly on-device (see
// syncAppointmentNotifications) so they ring at the appointment time even in
// Expo Go / offline, without depending on the backend sync cron. Their
// notification identifiers are namespaced so the two sync passes don't clobber
// each other's scheduled notifications.
const APPT_PREFIX = "appt:";
// Minutes before an appointment to fire the heads-up notification.
const APPT_LEAD_MINUTES = 15;

// The instant the notification should fire. Falls back to dueAt for older
// payloads that predate notifyAt.
function fireAt(reminder: Reminder): number {
  const notify = Date.parse(reminder.notifyAt ?? reminder.dueAt);
  return Number.isNaN(notify) ? Date.parse(reminder.dueAt) : notify;
}

function isActiveFuture(reminder: Reminder): boolean {
  if (!ACTIVE.has(reminder.status)) return false;
  const when = fireAt(reminder);
  return !Number.isNaN(when) && when > Date.now();
}

// Ensure the foreground handler + Android channel exist and we hold notification
// permission. Idempotent. Returns false when we can't/shouldn't schedule.
async function ensureSetup(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const Notifications = loadNotifications();

  if (!setupDone) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("reminders", {
        name: "Reminders",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
        sound: "default",
      });
    }
    setupDone = true;
  }

  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === "granted") return true;
  // Only prompt when the OS still allows it and the user hasn't hard-denied,
  // so we never nag someone who declined.
  if (canAskAgain) {
    const req = await Notifications.requestPermissionsAsync();
    return req.status === "granted";
  }
  return false;
}

function triggerFor(
  date: Date,
): import("expo-notifications").NotificationTriggerInput {
  const Notifications = loadNotifications();
  // Android routes the notification through the high-importance channel so it
  // makes sound + heads-up even when the app is backgrounded.
  if (Platform.OS === "android") {
    return {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
      channelId: "reminders",
    };
  }
  return {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date,
  };
}

// Schedule (or reschedule) a single reminder's local notification. The reminder
// id is used as the notification identifier so it's deterministic to update or
// cancel. No-ops for past / non-active reminders.
export async function scheduleReminderNotification(
  reminder: Reminder,
): Promise<void> {
  if (!isActiveFuture(reminder)) {
    await cancelReminderNotification(reminder.id);
    return;
  }
  const ok = await ensureSetup();
  if (!ok) return;
  const Notifications = loadNotifications();

  // Replace any existing schedule for this reminder so time edits take effect.
  await Notifications.cancelScheduledNotificationAsync(reminder.id).catch(
    () => undefined,
  );
  await Notifications.scheduleNotificationAsync({
    identifier: reminder.id,
    content: {
      title: reminder.title,
      body: reminder.notes ?? "Reminder is due",
      sound: "default",
      data: {
        kind: "reminder",
        reminderId: reminder.id,
        linkType: reminder.linkType ?? null,
        linkProvider: reminder.linkProvider ?? null,
        linkExternalId: reminder.linkExternalId ?? null,
      },
    },
    trigger: triggerFor(new Date(fireAt(reminder))),
  }).catch(() => undefined);
}

export async function cancelReminderNotification(
  reminderId: string,
): Promise<void> {
  if (Platform.OS === "web") return;
  const Notifications = loadNotifications();
  await Notifications.cancelScheduledNotificationAsync(reminderId).catch(
    () => undefined,
  );
}

// Reconcile the full set of on-device notifications against the given reminders.
// Cancels notifications for reminders that are no longer active, and (re)schedules
// the active future ones. Pass the user's "upcoming" reminders.
export async function syncReminderNotifications(
  reminders: Reminder[],
): Promise<void> {
  const ok = await ensureSetup();
  if (!ok) return;
  const Notifications = loadNotifications();

  // Appointment-linked reminders are handled by syncAppointmentNotifications
  // (scheduled directly from the live GHL appointment list), so exclude them
  // here to avoid scheduling the same meeting twice.
  const desired = reminders.filter(
    (r) => r.linkType !== "APPOINTMENT" && isActiveFuture(r),
  );
  const desiredIds = new Set(desired.map((r) => r.id));

  // Drop any previously-scheduled reminder notifications that are no longer
  // wanted (dismissed, deleted, snoozed away, already fired). Leave appointment
  // notifications alone — those belong to syncAppointmentNotifications.
  const scheduled =
    await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  for (const item of scheduled) {
    const data = item.content?.data as
      | { kind?: unknown; reminderId?: unknown }
      | undefined;
    if (data?.kind === "appointment" || item.identifier.startsWith(APPT_PREFIX))
      continue;
    const id =
      typeof data?.reminderId === "string" ? data.reminderId : item.identifier;
    if (id && !desiredIds.has(id)) {
      await Notifications.cancelScheduledNotificationAsync(
        item.identifier,
      ).catch(() => undefined);
    }
  }

  // (Re)schedule the wanted ones. Rescheduling is cheap and keeps times fresh.
  for (const reminder of desired) {
    await scheduleReminderNotification(reminder);
  }
}

// Read the appointment's start as a wall-clock local Date, matching how the UI
// displays it (we intentionally do NOT shift the CRM time into another zone).
function apptStartDate(startTime?: string): Date | null {
  if (!startTime) return null;
  const m = startTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  const d = m
    ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
    : new Date(startTime);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isCancelledAppt(appt: GhlAppointmentSummary): boolean {
  return /cancel/i.test(appt.status ?? "");
}

function clockLabel(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

// Reconcile on-device notifications for GoHighLevel appointments. For every
// non-cancelled future appointment we schedule an "at start" alert and (when
// there's still a window) a heads-up {@link APPT_LEAD_MINUTES} minutes before.
// These fire with sound even offline / in Expo Go, independent of the backend
// appointment-sync cron. Notifications for appointments no longer in the list
// (cancelled, deleted, already started) are cancelled.
export async function syncAppointmentNotifications(
  appointments: GhlAppointmentSummary[],
): Promise<void> {
  const ok = await ensureSetup();
  if (!ok) return;
  const Notifications = loadNotifications();
  const now = Date.now();

  type Desired = { id: string; date: Date; title: string; body: string };
  const desired: Desired[] = [];

  for (const appt of appointments) {
    if (!appt.id || isCancelledAppt(appt)) continue;
    const start = apptStartDate(appt.startTime);
    if (!start) continue;
    const startMs = start.getTime();
    const title = appt.title?.trim() || "Appointment";

    if (startMs > now) {
      desired.push({
        id: `${APPT_PREFIX}${appt.id}`,
        date: start,
        title,
        body: `Starting now${appt.contactName ? ` · ${appt.contactName}` : ""}`,
      });
    }

    const leadMs = startMs - APPT_LEAD_MINUTES * 60_000;
    if (leadMs > now) {
      desired.push({
        id: `${APPT_PREFIX}${appt.id}#lead`,
        date: new Date(leadMs),
        title: `Upcoming: ${title}`,
        body: `Starts at ${clockLabel(start)}`,
      });
    }
  }

  const desiredIds = new Set(desired.map((d) => d.id));

  // Cancel our own stale appointment notifications only.
  const scheduled =
    await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  for (const item of scheduled) {
    const data = item.content?.data as { kind?: unknown } | undefined;
    const isAppt =
      data?.kind === "appointment" || item.identifier.startsWith(APPT_PREFIX);
    if (isAppt && !desiredIds.has(item.identifier)) {
      await Notifications.cancelScheduledNotificationAsync(
        item.identifier,
      ).catch(() => undefined);
    }
  }

  for (const d of desired) {
    await Notifications.cancelScheduledNotificationAsync(d.id).catch(
      () => undefined,
    );
    await Notifications.scheduleNotificationAsync({
      identifier: d.id,
      content: {
        title: d.title,
        body: d.body,
        sound: "default",
        data: { kind: "appointment", appointmentId: d.id },
      },
      trigger: triggerFor(d.date),
    }).catch(() => undefined);
  }
}
