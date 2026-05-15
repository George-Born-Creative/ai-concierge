import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getMe } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import type { User } from '@/lib/api/types';
import { clearSession, getToken, hydrateSession, setSession } from '@/lib/session';

// Root entry: decides where the user should land based on whether they
// have a saved JWT and how far they got through onboarding.
//
//   no token              → /signup
//   token, expired/invalid → clear session, /signup
//   token, no plan        → /plan
//   token, no integration → /plan (placeholder until OAuth lands)
//   token, fully set up   → /(tabs)
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
          const me = await getMe();
          await setSession(token, me);
          go(nextRouteForUser(me));
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            await clearSession();
            go('/signup');
            return;
          }
          // Network / server hiccup: keep the cached session and go to home.
          // The next protected API call will surface the real error.
          go('/(tabs)');
        }
      } finally {
        setChecking(false);
      }
    }

    function go(path: string) {
      if (navigated.current) return;
      navigated.current = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace(path as any);
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

function nextRouteForUser(user: User): string {
  if (!user.plan) return '/plan';
  if (!user.hasIntegration) return '/plan';
  return '/(tabs)';
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#F6F9FF',
    flex: 1,
    justifyContent: 'center',
  },
});
