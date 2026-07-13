import type { Reminder } from '../api/types';

// Web fallback for on-device local reminder notifications. The real
// implementation lives in `local-notifications.native.ts` and is selected by
// Metro's platform resolver on iOS / Android. The browser has no scheduled
// local-notification concept, so every call here is a no-op.

export async function scheduleReminderNotification(_reminder: Reminder): Promise<void> {
  // No-op on web.
}

export async function cancelReminderNotification(_reminderId: string): Promise<void> {
  // No-op on web.
}

export async function syncReminderNotifications(_reminders: Reminder[]): Promise<void> {
  // No-op on web.
}
