import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = process.env.EXPO_PUBLIC_API_PORT ?? '4000';

/** Same machine IP Expo Metro uses — phone, emulator, and simulator all match. */
function metroHostIp(): string | null {
  const debuggerHost =
    Constants.expoGoConfig?.debuggerHost ??
    Constants.expoConfig?.hostUri?.split(':')[0] ??
    null;

  if (!debuggerHost) return null;
  const host = debuggerHost.includes(':') ? debuggerHost.split(':')[0] : debuggerHost;
  return host || null;
}

/**
 * Resolves the Nest API base URL.
 *
 * - Production: set EXPO_PUBLIC_API_BASE_URL=https://your-domain.com
 * - Local dev: auto-detects from Expo Metro (no LAN IP edits when Wi‑Fi changes)
 * - Web dev: http://localhost:4000
 */
export function getApiBaseUrl(): string {
  const env = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ?? '';

  if (env.startsWith('https://')) {
    return env;
  }

  if (__DEV__) {
    if (Platform.OS === 'web') {
      return env || `http://localhost:${API_PORT}`;
    }

    const host = metroHostIp();
    if (host) {
      return `http://${host}:${API_PORT}`;
    }
  }

  return env;
}
