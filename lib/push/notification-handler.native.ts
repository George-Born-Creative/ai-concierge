import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

// Registers a listener that fires when the user taps an incoming push
// notification. Reads the `reminderId` we stash in the notification's `data`
// payload backend-side, then deep-links the user into the Reminders screen
// with that row highlighted (via the `focus` search param).
export function useNotificationTapHandler(): void {
  const router = useRouter();

  useEffect(() => {
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
