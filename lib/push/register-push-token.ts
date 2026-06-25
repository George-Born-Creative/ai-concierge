import { setPushState } from './state';

// Web fallback for the Expo push token registration helper. The real
// implementation lives in `register-push-token.native.ts` and is selected by
// Metro's platform-resolver on iOS / Android. Web has no push token concept,
// so every call here resolves with `granted: false, reason: 'web'`.

export type PushRegistration =
  | { granted: true; token: string }
  | {
      granted: false;
      reason: 'not_a_device' | 'denied' | 'no_project_id' | 'error' | 'web';
    };

export async function registerPushToken(): Promise<PushRegistration> {
  setPushState({ status: 'web' });
  return { granted: false, reason: 'web' };
}

export async function clearPushTokenCache(): Promise<void> {
  // No-op on web.
}
