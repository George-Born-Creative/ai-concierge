import { apiRequest } from './client';
import type {
  CreateReminderRequest,
  Reminder,
  ReminderListRange,
  SetPushTokenResponse,
  SetTimezoneResponse,
  SnoozeReminderRequest,
  UpdateReminderRequest,
} from './types';

export function listReminders(
  range: ReminderListRange = 'upcoming',
): Promise<Reminder[]> {
  return apiRequest<Reminder[]>(`/reminders?range=${range}`, { method: 'GET' });
}

export function createReminder(body: CreateReminderRequest): Promise<Reminder> {
  return apiRequest<Reminder>('/reminders', { method: 'POST', body });
}

export function updateReminder(
  id: string,
  body: UpdateReminderRequest,
): Promise<Reminder> {
  return apiRequest<Reminder>(`/reminders/${id}`, { method: 'PATCH', body });
}

export function snoozeReminder(
  id: string,
  body: SnoozeReminderRequest,
): Promise<Reminder> {
  return apiRequest<Reminder>(`/reminders/${id}/snooze`, {
    method: 'POST',
    body,
  });
}

export function dismissReminder(id: string): Promise<Reminder> {
  return apiRequest<Reminder>(`/reminders/${id}/dismiss`, { method: 'POST' });
}

export function deleteReminder(id: string): Promise<void> {
  return apiRequest<void>(`/reminders/${id}`, { method: 'DELETE' });
}

// Pass `null` to clear the user's stored push token (call this on signout
// so the backend stops trying to dispatch reminders to a logged-out device).
export function setPushToken(
  token: string | null,
): Promise<SetPushTokenResponse> {
  return apiRequest<SetPushTokenResponse>('/users/me/push-token', {
    method: 'POST',
    body: { token },
  });
}

export function setTimezone(timezone: string): Promise<SetTimezoneResponse> {
  return apiRequest<SetTimezoneResponse>('/users/me/timezone', {
    method: 'PATCH',
    body: { timezone },
  });
}
