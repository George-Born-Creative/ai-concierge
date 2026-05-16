import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getMe } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { routeForUser } from '@/lib/onboarding-route';
import { clearSession, getToken, getUser, hydrateSession, setSession } from '@/lib/session';

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
  const [checking, setChecking] = useState(true);
  // Guard so React strict-mode double-mount doesn't fire two redirects.
  const navigated = useRef(false);

  useEffect(() => {
    async function decide() {
      try {
        await hydrateSession();
        const token = getToken();

        if (!token) {
          go('/signup');
          return;
        }

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
        setChecking(false);
      }
    }

    function go(target: Href) {
      if (navigated.current) return;
      navigated.current = true;
      router.replace(target);
    }

    void decide();
  }, [router]);

  if (!checking) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#1A73E8" />
    </View>
  );
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
    alignItems: 'center',
    backgroundColor: '#F6F9FF',
    flex: 1,
    justifyContent: 'center',
  },
});
