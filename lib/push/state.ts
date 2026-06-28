import { useEffect, useState } from 'react';

// Tiny in-memory module that surfaces the most recent push-permission
// result so screens can render a "notifications are off" banner without
// each one re-running registerPushToken(). Updated by the push-token
// registration hook on iOS / Android; web stays in its initial state.

export type PushState = {
  /** Most recent registerPushToken() result, or null if it hasn't run yet. */
  status:
    | 'granted'
    | 'denied'
    | 'not_a_device'
    | 'no_project_id'
    | 'error'
    | 'web'
    | 'expo_go'
    | null;
};

const state: PushState = { status: null };
const listeners = new Set<(s: PushState) => void>();

function emit() {
  for (const l of listeners) l({ ...state });
}

export function setPushState(next: Partial<PushState>): void {
  Object.assign(state, next);
  emit();
}

export function getPushState(): PushState {
  return { ...state };
}

export function subscribePushState(
  listener: (s: PushState) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// React hook for components that want to react to permission changes
// (e.g. the Reminders screen banner).
export function usePushState(): PushState {
  const [snapshot, setSnapshot] = useState<PushState>(() => getPushState());
  useEffect(() => subscribePushState(setSnapshot), []);
  return snapshot;
}
