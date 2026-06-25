import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { remindersApi } from '../api';
import { clearCacheItem, getCacheItem, setCacheItem } from '../cache';

const TOKEN_CACHE_KEY = 'ai_concierge.expo_push_token.v1';

export type PushRegistration =
  | { granted: true; token: string }
  | {
      granted: false;
      reason: 'not_a_device' | 'denied' | 'no_project_id' | 'error' | 'web';
    };

// Configure foreground notification presentation. Module-level so it runs
// once at import time; safe to re-import elsewhere.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerPushToken(): Promise<PushRegistration> {
  if (!Device.isDevice) {
    return { granted: false, reason: 'not_a_device' };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
      sound: 'default',
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const result = await Notifications.requestPermissionsAsync();
    status = result.status;
  }
  if (status !== 'granted') {
    await clearPushTokenCache();
    await safePostTokenToBackend(null);
    return { granted: false, reason: 'denied' };
  }

  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
      ?.eas?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

  if (!projectId) {
    return { granted: false, reason: 'no_project_id' };
  }

  try {
    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResult.data;

    // Skip the round-trip if the backend already has this token.
    const cached = await getCacheItem(TOKEN_CACHE_KEY);
    if (cached !== token) {
      await safePostTokenToBackend(token);
      await setCacheItem(TOKEN_CACHE_KEY, token);
    }
    return { granted: true, token };
  } catch {
    return { granted: false, reason: 'error' };
  }
}

export async function clearPushTokenCache(): Promise<void> {
  await clearCacheItem(TOKEN_CACHE_KEY);
}

async function safePostTokenToBackend(token: string | null): Promise<void> {
  try {
    await remindersApi.setPushToken(token);
  } catch {
    // Network / 401 — retry on next cold start.
  }
}
