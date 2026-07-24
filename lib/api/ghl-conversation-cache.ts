import { GhlConversationSummary } from './types';

// Simple in-memory cache for GHL conversations during a session.
// In a more robust implementation, this might be backed by AsyncStorage or SQLite.
let cachedConversations: GhlConversationSummary[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function getCachedConversations(): GhlConversationSummary[] | null {
  if (Date.now() - lastFetchTime > CACHE_TTL_MS) {
    return null;
  }
  return cachedConversations;
}

export function setCachedConversations(conversations: GhlConversationSummary[]): void {
  cachedConversations = conversations;
  lastFetchTime = Date.now();
}

export function clearConversationCache(): void {
  cachedConversations = null;
  lastFetchTime = 0;
}
