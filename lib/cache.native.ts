import AsyncStorage from '@react-native-async-storage/async-storage';

// Native local cache backed by AsyncStorage. Used for non-sensitive
// memoised API data (plan list, etc.). Secrets continue to live in
// secure-storage / expo-secure-store.

export async function getCacheItem(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setCacheItem(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Disk full / IO error — non-fatal, the next fetch just misses the cache.
  }
}

export async function clearCacheItem(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Non-fatal.
  }
}
