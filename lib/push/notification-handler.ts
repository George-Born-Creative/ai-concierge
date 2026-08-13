// Web fallback for the notification-tap router hook. Native implementation
// lives in `notification-handler.native.ts`. Web doesn't fire Expo push
// notifications, so the hook is a no-op.

export function useNotificationTapHandler(): void {
  // No-op on web.
}
