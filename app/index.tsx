import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { getMe } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { markBootstrapReady } from '@/lib/bootstrap-signal';
import { routeForUser } from '@/lib/onboarding-route';
import { registerPushToken } from '@/lib/push/register-push-token';
import { getCacheItem } from '@/lib/cache';
import { clearSession, getToken, getUser, hydrateSession, setSession } from '@/lib/session';
import { APP_BG } from '@/constants/theme';

// Root entry: decides where the user should land based on the saved JWT and
// how far they got through onboarding. The full funnel is:
//
//   no token                            → /signup
//   token, expired (401)                → clear session, /signup
//   token, no plan / subscription       → /plan
//   token, plan but no CRM connected    → /connect?provider=<ghl|hubspot>
//   token, CRM connected, no OpenAI key → /openai-key
//   token, all set                      → /(tabs)
//
// When the backend can't be reached we fall back to the cached user we wrote
// during signup/signin so the user lands on the correct step instead of being
// dumped on the home screen.
//
// /auth/me is also wrapped in a 6 s timeout so a stuck request can't keep the
// loading spinner up forever.
const ME_TIMEOUT_MS = 6_000;

export default function RootIndex() {
  const router = useRouter();
  // Guard so React strict-mode double-mount doesn't fire two redirects.
  const navigated = useRef(false);

  useEffect(() => {
    async function decide() {
      try {
        await hydrateSession();
        const token = getToken();

        if (!token) {
          const hasSeenIntro = await getCacheItem('has_seen_intro');
          if (hasSeenIntro === 'true') {
            go('/signup');
          } else {
            go('/intro' as any);
          }
          return;
        }

        // Returning users skip the auth screens, so re-register the push token
        // on every cold start to keep the backend's token fresh (and ensure the
        // notification channel/handler are set up). Fire-and-forget.
        void registerPushToken();

        try {
          const me = await withTimeout(getMe(), ME_TIMEOUT_MS);
          await setSession(token, me);
          go(routeForUser(me));
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            await clearSession();
            go('/signup');
            return;
          }
          // Network / server hiccup: fall back to the cached user so we still
          // route to the correct onboarding step. If we have no cached user,
          // send them back to signin.
          const cached = getUser();
          if (cached) {
            go(routeForUser(cached));
          } else {
            go('/signup');
          }
        }
      } finally {
        // Tell the root layout the session is ready so the JS dots-splash can
        // fade out. A small delay lets the target screen mount its first frame
        // underneath the overlay, avoiding a white flash mid-transition.
        setTimeout(() => {
          markBootstrapReady();
        }, 80);
      }
    }

    function go(target: Href) {
      if (navigated.current) return;
      navigated.current = true;
      router.replace(target);
    }

    void decide();
  }, [router]);

  // While bootstrapping, the native splash is still covering the screen, so we
  // render a matching solid background instead of a spinner.
  return <View style={styles.container} />;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Request timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(t);
        resolve(value);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      },
    );
  });
}

const styles = StyleSheet.create({
  container: {
    // The JS dots-splash overlay covers this view while bootstrap runs. We
    // still match the splash background so the very first paint blends in.
    backgroundColor: APP_BG,
    flex: 1,
  },
});
