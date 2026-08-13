import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

// Expo Go (SDK 53+) has no remote push, and importing expo-notifications there
// triggers a redbox. Detect Expo Go so we can skip the listener entirely and
// avoid running the module's side-effectful import-time code.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// Registers a listener that fires when the user taps an incoming push
// notification. Reads the `reminderId` we stash in the notification's `data`
// payload backend-side, then deep-links the user into the Reminders screen
// with that row highlighted (via the `focus` search param).
export function useNotificationTapHandler(): void {
  const router = useRouter();

  useEffect(() => {
    if (isExpoGo) return;

    // Lazy require so expo-notifications is only loaded on dev / standalone
    // builds, never in Expo Go.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy load to keep the side-effectful module out of Expo Go
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data ?? {};
        const reminderId =
          typeof data.reminderId === 'string' ? data.reminderId : null;
        if (reminderId) {
          router.push({
            pathname: '/(stack)/reminders',
            params: { focus: reminderId },
          });
        }
      },
    );
    return () => subscription.remove();
  }, [router]);
}
