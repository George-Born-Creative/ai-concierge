import { deleteSecureItem, getSecureItem, setSecureItem } from './secure-storage';

// Dev-only escape hatch: lets us bypass the /plan and /connect gates so we
// can land on the home tab while the rest of the app is still under
// construction. Persisted so cold starts don't bounce the user back.
//
// Cleared on sign-out (see profile-screen-content) so a fresh account goes
// through the proper funnel again.

const KEY = 'ai_concierge.dev_skip_onboarding';

let cached: boolean | null = null;

export async function hydrateDevSkip(): Promise<void> {
  if (cached !== null) return;
  try {
    cached = (await getSecureItem(KEY)) === '1';
  } catch {
    cached = false;
  }
}

export function isOnboardingSkipped(): boolean {
  return cached === true;
}

export async function setOnboardingSkipped(value: boolean): Promise<void> {
  cached = value;
  if (value) {
    await setSecureItem(KEY, '1');
  } else {
    await deleteSecureItem(KEY);
  }
}
