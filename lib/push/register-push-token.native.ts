import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { remindersApi } from '../api';
import { clearCacheItem, getCacheItem, setCacheItem } from '../cache';
import { setPushState } from './state';

const TOKEN_CACHE_KEY = 'ai_concierge.expo_push_token.v1';

export type PushRegistration =
  | { granted: true; token: string }
  | {
      granted: false;
      reason: 'not_a_device' | 'denied' | 'no_project_id' | 'error' | 'web' | 'expo_go';
    };

// Expo Go (SDK 53+) removed remote push. Even *importing* expo-notifications
// there runs its auto-registration side effect, which throws a noisy redbox.
// So we detect Expo Go and (a) never execute the module's import-time code and
// (b) make push registration a no-op. Dev client / standalone builds are
// unaffected and keep full functionality.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type NotificationsModule = typeof import('expo-notifications');

let cachedNotifications: NotificationsModule | null = null;

// Lazy, guarded require: the module's side-effectful top-level code only runs
// the first time this is called — never in Expo Go.
function loadNotifications(): NotificationsModule {
  if (!cachedNotifications) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy load to keep the side-effectful module out of Expo Go
    cachedNotifications = require('expo-notifications') as NotificationsModule;
  }
  return cachedNotifications;
}

if (!isExpoGo) {
  // Configure foreground notification presentation once at import time.
  loadNotifications().setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function registerPushToken(): Promise<PushRegistration> {
  if (isExpoGo) {
    setPushState({ status: 'expo_go' });
    return { granted: false, reason: 'expo_go' };
  }

  const Notifications = loadNotifications();

  if (!Device.isDevice) {
    setPushState({ status: 'not_a_device' });
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
    setPushState({ status: 'denied' });
    return { granted: false, reason: 'denied' };
  }

  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
      ?.eas?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

  if (!projectId) {
    setPushState({ status: 'no_project_id' });
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
    setPushState({ status: 'granted' });
    return { granted: true, token };
  } catch {
    setPushState({ status: 'error' });
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
