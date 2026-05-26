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
  if (!host) return null;

  // Physical devices cannot reach the dev PC via localhost.
  if (Platform.OS !== 'web' && (host === 'localhost' || host === '127.0.0.1')) {
    return null;
  }

  return host;
}

/**
 * Resolves the Nest API base URL.
 *
 * - Production: set EXPO_PUBLIC_API_BASE_URL=https://your-domain.com
 * - Local dev (device): uses the same IP as Expo Metro (QR code)
 * - Phone hotspot (PC joins phone): auto — use Expo QR IP (often 192.168.43.x)
 * - PC hotspot (phone joins PC): EXPO_PUBLIC_API_USE_LAN_ENV=1 + http://192.168.137.1:4000
 * - Web dev: http://localhost:4000
 */
export function getApiBaseUrl(): string {
  const env = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ?? '';
  const useLanEnv = process.env.EXPO_PUBLIC_API_USE_LAN_ENV === '1';

  if (env.startsWith('https://')) {
    return env;
  }

  if (__DEV__) {
    if (Platform.OS === 'web') {
      return env || `http://localhost:${API_PORT}`;
    }

    const host = metroHostIp();
    if (host && !useLanEnv) {
      return `http://${host}:${API_PORT}`;
    }

    if (env.startsWith('http://')) {
      return env;
    }

    if (host) {
      return `http://${host}:${API_PORT}`;
    }
  }

  return env;
}
