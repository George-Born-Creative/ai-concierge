// Lightweight in-memory cache for the Reminders screen so revisiting the tab,
// switching between Upcoming/All, or reacting to a realtime event renders the
// last-known data instantly instead of flashing a spinner. Follows a
// stale-while-revalidate model: reads return cached data immediately; the
// screen still revalidates in the background and overwrites the entry.
//
// Scope: process memory only. It survives component unmount/remount and
// navigation within a session, and is cleared on sign-out. It intentionally
// does NOT persist across cold starts (reminders are time-sensitive and cheap
// to refetch once per launch).
import type { GhlAppointmentSummary, Reminder } from './types';

type Entry<T> = { data: T; at: number };

// How long a cached entry is considered "fresh". Within this window an initial
// load can skip the network entirely (e.g. rapid tab switches); after it, the
// cached data is still shown but a background revalidation is triggered.
const FRESH_MS = 30_000;

const reminderCache = new Map<string, Entry<Reminder[]>>();
let appointmentCache: Entry<GhlAppointmentSummary[]> | null = null;

export function getCachedReminders(key: string): Reminder[] | undefined {
  return reminderCache.get(key)?.data;
}

export function isRemindersFresh(key: string): boolean {
  const entry = reminderCache.get(key);
  return !!entry && Date.now() - entry.at < FRESH_MS;
}

export function setCachedReminders(key: string, data: Reminder[]): void {
  reminderCache.set(key, { data, at: Date.now() });
}

export function getCachedAppointments(): GhlAppointmentSummary[] | undefined {
  return appointmentCache?.data;
}

export function isAppointmentsFresh(): boolean {
  return !!appointmentCache && Date.now() - appointmentCache.at < FRESH_MS;
}

export function setCachedAppointments(data: GhlAppointmentSummary[]): void {
  appointmentCache = { data, at: Date.now() };
}

// After a write we update the active tab's cache directly, but the other tabs
// (e.g. "All" while viewing "Upcoming") now hold pre-mutation data. Drop them
// so they refetch on next view instead of serving a stale row.
export function invalidateRemindersExcept(key: string): void {
  for (const k of [...reminderCache.keys()]) {
    if (k !== key) reminderCache.delete(k);
  }
}

// Drop everything. Call on sign-out so the next user never sees the previous
// account's reminders.
export function clearRemindersCache(): void {
  reminderCache.clear();
  appointmentCache = null;
}
