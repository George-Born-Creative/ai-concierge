import { clearCrmCache } from './api/crm-cache';
import { clearRemindersCache } from './api/reminders-cache';
import { clearConversationCache } from './api/ghl-conversation-cache';
import type { User } from './api/types';
import { deleteSecureItem, getSecureItem, setSecureItem } from './secure-storage';
import { clearSupportDraft } from './support/draft';

// Session store backed by SecureStore on native and localStorage on web.
// Module-level state lets every API call grab the active JWT without having
// to thread it through every screen.

const TOKEN_KEY = 'ai_concierge.token';
const USER_KEY = 'ai_concierge.user';

type Session = {
  token: string | null;
  user: User | null;
};

const state: Session = { token: null, user: null };
const listeners = new Set<(s: Session) => void>();
let hydrated = false;

function emit() {
  for (const l of listeners) l({ ...state });
}

export async function hydrateSession(): Promise<Session> {
  if (hydrated) return { ...state };
  try {
    const [token, userJson] = await Promise.all([
      getSecureItem(TOKEN_KEY),
      getSecureItem(USER_KEY),
    ]);
    state.token = token;
    state.user = userJson ? (JSON.parse(userJson) as User) : null;
  } catch {
    state.token = null;
    state.user = null;
  } finally {
    hydrated = true;
    emit();
  }
  return { ...state };
}

export async function setSession(token: string, user: User): Promise<void> {
  state.token = token;
  state.user = user;
  hydrated = true;
  await Promise.all([
    setSecureItem(TOKEN_KEY, token),
    setSecureItem(USER_KEY, JSON.stringify(user)),
  ]);
  emit();
}

// Updates the cached user without touching the JWT. Used after server-side
// state changes (Stripe payment, CRM connect) so the auth gate doesn't
// bounce the user back to an already-completed step on the next cold start.
export async function refreshUser(user: User): Promise<void> {
  state.user = user;
  await setSecureItem(USER_KEY, JSON.stringify(user));
  emit();
}

export async function clearSession(): Promise<void> {
  const userId = state.user?.id;
  state.token = null;
  state.user = null;
  hydrated = true;
  // Drop cached reminders/appointments and CRM lists so the next signed-in
  // user never sees the previous account's data.
  clearRemindersCache();
  clearCrmCache();
  clearConversationCache();
  await Promise.all([
    deleteSecureItem(TOKEN_KEY),
    deleteSecureItem(USER_KEY),
    userId ? clearSupportDraft(userId) : Promise.resolve(),
  ]);
  emit();
}

export function getToken(): string | null {
  return state.token;
}

export function getUser(): User | null {
  return state.user;
}

export function isHydrated(): boolean {
  return hydrated;
}

export function subscribeSession(listener: (s: Session) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
