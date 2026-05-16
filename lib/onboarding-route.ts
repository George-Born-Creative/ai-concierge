import type { Href } from 'expo-router';

import type { User } from './api/types';

// Centralized "where should this user go next?" logic. Used by:
//   - the root auth gate at app/index.tsx on cold start
//   - the auth screen after a successful signin / signup
//   - any future place that wants to drop a user back into the funnel
//
// Funnel:
//   no plan                 → /plan         (buy a subscription)
//   plan but no integration → /connect      (authorize GHL / HubSpot)
//   integration but no key  → /openai-key   (paste OpenAI key)
//   all set                 → /(tabs)
export function routeForUser(user: User): Href {
  if (!user.plan) {
    return '/plan';
  }
  if (!user.hasIntegration) {
    return { pathname: '/connect', params: { provider: user.plan.provider } };
  }
  if (!user.hasOpenAIKey) {
    return '/openai-key';
  }
  return '/(tabs)';
}
