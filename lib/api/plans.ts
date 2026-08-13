import { clearCacheItem, getCacheItem, setCacheItem } from '../cache';
import { apiRequest } from './client';
import type { PlanListItem } from './types';

// Plans rarely change (per-CRM monthly price + Apple IAP product id) so
// we memoise the response on-device with a long TTL. Within the TTL the
// mobile app never hits /plans, removing a server round-trip from cold
// onboarding starts and cushioning short backend outages. On TTL miss we
// fetch fresh data; if that fetch fails we serve any cached value (even
// past TTL) so the screen still renders.
const CACHE_KEY = 'ai_concierge.plans.v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEnvelope = {
  ts: number;
  data: PlanListItem[];
};

async function readCache(): Promise<CacheEnvelope | null> {
  const raw = await getCacheItem(CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed != null &&
      typeof parsed === 'object' &&
      'ts' in parsed &&
      'data' in parsed &&
      typeof (parsed as CacheEnvelope).ts === 'number' &&
      Array.isArray((parsed as CacheEnvelope).data)
    ) {
      return parsed as CacheEnvelope;
    }
  } catch {
    // Corrupt cache entry — drop it on the next write.
  }
  return null;
}

async function writeCache(data: PlanListItem[]): Promise<void> {
  const envelope: CacheEnvelope = { ts: Date.now(), data };
  await setCacheItem(CACHE_KEY, JSON.stringify(envelope));
}

// Fetches the active subscription plans, with 24h cache-first semantics.
// Pass `{ force: true }` to bypass the cache (e.g. an admin-driven price
// refresh). The cache is read on every call, so even a `force` fetch falls
// back to the cached data if the network is unavailable.
export async function listPlans(
  options: { force?: boolean } = {},
): Promise<PlanListItem[]> {
  const cached = await readCache();
  const isFresh = cached != null && Date.now() - cached.ts < CACHE_TTL_MS;

  if (!options.force && isFresh) {
    return cached.data;
  }

  try {
    const fresh = await apiRequest<PlanListItem[]>('/plans', { method: 'GET' });
    await writeCache(fresh);
    return fresh;
  } catch (err) {
    // Network / 401 / 5xx — fall back to any cached value (even if stale)
    // so the user still sees plan cards. Throw only when we have nothing
    // to render.
    if (cached) return cached.data;
    throw err;
  }
}

// Drops the cached plan list. Call after a backend-driven price change
// notification or from a "refresh prices" admin action. Sign-out does
// not need to call this — plans are not user-specific.
export async function clearPlansCache(): Promise<void> {
  await clearCacheItem(CACHE_KEY);
}
