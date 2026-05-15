import type { User } from './api/types';
import { deleteSecureItem, getSecureItem, setSecureItem } from './secure-storage';

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

export async function clearSession(): Promise<void> {
  state.token = null;
  state.user = null;
  hydrated = true;
  await Promise.all([deleteSecureItem(TOKEN_KEY), deleteSecureItem(USER_KEY)]);
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
