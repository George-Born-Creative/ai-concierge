// Simple in-memory cache for GHL conversations during a session.
// Now supports section‑keyed caching (e.g. "my-inbox:unread").

import { GhlConversationSummary } from './types';

type CacheEntry = {
  conversations: GhlConversationSummary[];
  timestamp: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache: Record<string, CacheEntry> = {};

/** Get cached conversations for a specific cache key. */
export function getCachedConversations(key: string = 'default'): GhlConversationSummary[] | null {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    delete cache[key];
    return null;
  }
  return entry.conversations;
}

/** Store conversations under a specific cache key. */
export function setCachedConversations(key: string = 'default', conversations: GhlConversationSummary[]): void {
  cache[key] = { conversations, timestamp: Date.now() };
}

/** Clear cache for a specific key or all keys. */
export function clearConversationCache(key?: string): void {
  if (key) {
    delete cache[key];
  } else {
    for (const k of Object.keys(cache)) delete cache[k];
  }
}
