// In-memory cache for the CRM browse screens (GHL + HubSpot) so revisiting a
// list, switching between the overview and a focused object page, or reacting
// to a `crm.invalidate` event renders the last-known rows instantly instead of
// flashing a skeleton. Stale-while-revalidate: reads return cached data
// immediately; the screen still revalidates in the background and overwrites
// the entry.
//
// Keyed by `${provider}:${object}` (e.g. "ghl:contacts", "hubspot:orders").
// Scope is process memory only — it survives component unmount/remount and
// navigation within a session and is cleared on sign-out. It intentionally
// does NOT persist across cold starts (CRM data is cheap to refetch once per
// launch and should never be stale for long).

type Entry = { data: unknown[]; at: number };

// How long a cached entry is considered "fresh". Within this window an initial
// (focus) load can skip the network entirely; after it, the cached rows are
// still shown but a background revalidation is triggered. Pull-to-refresh and
// `crm.invalidate` always bypass this.
const FRESH_MS = 30_000;

const cache = new Map<string, Entry>();

export function crmCacheKey(provider: string, object: string): string {
  return `${provider}:${object}`;
}

export function getCrmCache<T>(key: string): T[] | undefined {
  return cache.get(key)?.data as T[] | undefined;
}

export function isCrmFresh(key: string): boolean {
  const entry = cache.get(key);
  return !!entry && Date.now() - entry.at < FRESH_MS;
}

export function setCrmCache<T>(key: string, data: T[]): void {
  cache.set(key, { data, at: Date.now() });
}

// Drop everything. Called on sign-out so the next user never sees the previous
// account's CRM rows.
export function clearCrmCache(): void {
  cache.clear();
}
