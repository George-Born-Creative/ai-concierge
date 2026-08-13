// Web fallback for the generic local cache. Used by API clients to
// memoise non-sensitive responses (plan list, etc.) across reloads.
// The native counterpart lives in cache.native.ts and uses AsyncStorage;
// secrets must keep going through secure-storage instead.

export async function getCacheItem(key: string): Promise<string | null> {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setCacheItem(key: string, value: string): Promise<void> {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Quota exceeded / private mode — non-fatal, the next fetch just
    // misses the cache.
  }
}

export async function clearCacheItem(key: string): Promise<void> {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Non-fatal.
  }
}
