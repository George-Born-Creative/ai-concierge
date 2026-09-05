import type { Href } from 'expo-router';

import type { CrmProvider, PlanCode, User, UserPlan } from './api/types';

// Stripe statuses we consider "subscribed". Anything else — incomplete,
// past_due, canceled, unpaid — sends the user back to /plan to finish or
// re-subscribe.
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);

export const PLAN_CODE_FOR_PROVIDER: Record<CrmProvider, PlanCode> = {
  ghl: 'ghl-pro',
  hubspot: 'hubspot-pro',
};

export function isActiveSubscription(plan?: UserPlan | null): boolean {
  return !!plan && ACTIVE_SUBSCRIPTION_STATUSES.has(plan.status);
}

export function providerForPlanCode(code: PlanCode): CrmProvider {
  return code === 'hubspot-pro' ? 'hubspot' : 'ghl';
}

export function listUserSubscriptions(user: User | null | undefined): UserPlan[] {
  if (user?.subscriptions?.length) return user.subscriptions;
  if (user?.plans?.length) return user.plans;
  if (user?.plan) return [user.plan];
  return [];
}

export function hasCrmEntitlement(
  user: User | null | undefined,
  provider: CrmProvider,
): boolean {
  if (user?.entitlements?.[provider]) return true;
  return listUserSubscriptions(user).some(
    (plan) => plan.provider === provider && isActiveSubscription(plan),
  );
}

export function hasAnyActivePlan(user: User | null | undefined): boolean {
  if (user?.entitlements?.ghl || user?.entitlements?.hubspot) return true;
  return listUserSubscriptions(user).some((plan) => isActiveSubscription(plan));
}

// Centralized "where should this user go next?" logic. Used by:
//   - the root auth gate at app/index.tsx on cold start
//   - the auth screen after a successful signin / signup
//   - any future place that wants to drop a user back into the funnel
//
// Funnel (matches the product spec):
//   email not verified                                     → /verify-email
//   not subscribed (no plan or status not active/trialing) → /plan
//   subscribed but CRM not authorized                      → /connect
//   CRM connected but no OpenAI key                        → /openai-key
//   everything set                                         → /(tabs) (Home)
export function routeForUser(user: User): Href {
  // Gate email/password signups until they confirm the emailed code. Checked
  // explicitly against `false` so older cached users (undefined) aren't gated.
  // Cast: the /verify-email route exists (app/(auth)/verify-email.tsx) but
  // expo-router only regenerates the typed-routes union at Metro start, so it
  // may not be in the committed types yet.
  if (user.emailVerified === false) {
    return '/verify-email' as Href;
  }
  if (!hasAnyActivePlan(user)) {
    return '/plan';
  }
  if (!user.hasIntegration) {
    const provider =
      user.provider ??
      user.plan?.provider ??
      (user.entitlements?.hubspot ? 'hubspot' : 'ghl');
    return { pathname: '/connect', params: { provider } };
  }
  if (!user.hasOpenAIKey) {
    return '/openai-key';
  }
  return '/(tabs)';
}
