// Web fallback. expo-secure-store is native-only, so on web we fall back to
// localStorage (good enough for development; in production a real session
// cookie would be preferable).

export async function getSecureItem(key: string): Promise<string | null> {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage.getItem(key);
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(key, value);
}

export async function deleteSecureItem(key: string): Promise<void> {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.removeItem(key);
}
