import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getMe } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { createPaymentSheet, refreshSubscription } from '@/lib/api/payment';
import { listPlans } from '@/lib/api/plans';
import type { PlanCode, PlanListItem } from '@/lib/api/types';
import { isActiveSubscription, routeForUser } from '@/lib/onboarding-route';
import { getUser, refreshUser } from '@/lib/session';
import { useToast } from '@/lib/toast';

import { useStripePaymentSheet } from './use-stripe-payment-sheet';

// Display-only metadata for each plan: icon, fallback name, one-line tagline.
// The rest of the card (price, feature bullets) is sourced from the backend
// via GET /plans so prices and features can be tweaked without an app release.
// Name is duplicated here so the loading skeleton can show plan names without
// waiting for the backend round-trip.
type PlanDisplay = {
  name: string;
  description: string;
  icon: keyof typeof MaterialIcons.glyphMap;
};

const PLAN_DISPLAY: Record<PlanCode, PlanDisplay> = {
  'ghl-pro': {
    name: 'GoHighLevel plan',
    description: 'Voice AI that drives your GoHighLevel CRM.',
    icon: 'hub',
  },
  'hubspot-pro': {
    name: 'HubSpot plan',
    description: 'Voice AI that drives your HubSpot CRM.',
    icon: 'cloud',
  },
};

// Order plans render in. Anything missing from PLAN_DISPLAY is appended in
// backend order so a future plan code rendered before its display entry
// ships still works.
const PLAN_ORDER: PlanCode[] = ['ghl-pro', 'hubspot-pro'];

// Merged shape used to render each card. `live` is null until GET /plans
// resolves; in that loading window the price pill renders a skeleton and
// the subscribe button is disabled.
type DisplayCard = {
  id: PlanCode;
  name: string;
  description: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  live: PlanListItem | null;
};

export function PlanSelectionScreen() {
  const router = useRouter();
  const { show } = useToast();
  const stripeSheet = useStripePaymentSheet();
  const [selectedPlan, setSelectedPlan] = useState<PlanCode>('ghl-pro');
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [plans, setPlans] = useState<PlanListItem[] | null>(null);

  // Fetch live prices + features on mount. While `plans` is null we render
  // skeletons in the price pill; on failure we surface a toast and let the
  // user retry by leaving and coming back to the screen.
  useEffect(() => {
    let cancelled = false;
    listPlans()
      .then((result) => {
        if (cancelled) return;
        setPlans(result);
      })
      .catch(() => {
        if (cancelled) return;
        show('Could not load plan prices. Please try again.', 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [show]);

  // Merge backend plan data with the local display metadata (icon, fallback
  // name + description) and order according to PLAN_ORDER. Cards always
  // render — even before the fetch completes — using local fallback name +
  // icon, with the price pill showing a skeleton until live data arrives.
  // Any plan id missing from PLAN_DISPLAY is rendered with a generic icon.
  const displayPlans = useMemo<DisplayCard[]>(() => {
    const byCode = new Map<PlanCode, PlanListItem>();
    if (plans) for (const p of plans) byCode.set(p.id, p);

    const seen = new Set<PlanCode>();
    const cards: DisplayCard[] = [];
    for (const code of PLAN_ORDER) {
      const display = PLAN_DISPLAY[code];
      const live = byCode.get(code);
      cards.push({
        id: code,
        name: live?.name ?? display?.name ?? code,
        description: display?.description ?? '',
        icon: display?.icon ?? ('workspace-premium' as keyof typeof MaterialIcons.glyphMap),
        live: live ?? null,
      });
      seen.add(code);
    }
    if (plans) {
      for (const p of plans) {
        if (seen.has(p.id)) continue;
        cards.push({
          id: p.id,
          name: p.name,
          description: '',
          icon: 'workspace-premium',
          live: p,
        });
      }
    }
    return cards;
  }, [plans]);

  const active = useMemo(
    () => displayPlans.find((d) => d.id === selectedPlan) ?? displayPlans[0],
    [displayPlans, selectedPlan],
  );

  const canSubscribe = Boolean(active?.live);

  const continueAfterPlan = useCallback(
    async (user = getUser()) => {
      let profile = user;
      try {
        profile = await getMe();
        await refreshUser(profile);
      } catch {
        if (!profile) return;
      }
      router.replace(routeForUser(profile));
    },
    [router],
  );

  async function subscribeToActivePlan() {
    if (!active || !active.live) {
      show('Plans are still loading. Please try again in a moment.', 'error');
      return;
    }
    setIsSubscribing(true);
    try {
      let user = getUser();
      try {
        user = await getMe();
        await refreshUser(user);
      } catch {
        // Fall back to cached profile if the network hiccups.
      }

      if (user && isActiveSubscription(user.plan)) {
        const planName = user.plan?.name ?? 'your plan';
        show(`You already have an active subscription (${planName}).`, 'info');
        await continueAfterPlan(user);
        return;
      }

      if (Platform.OS === 'web') {
        show('Stripe checkout is only available on the iOS / Android build.', 'info');
        return;
      }
      if (!stripeSheet) {
        show('Payment SDK is still loading. Please try again in a moment.', 'error');
        return;
      }

      const sheet = await createPaymentSheet({ planCode: active.id });

      const init = await stripeSheet.initPaymentSheet({
        merchantDisplayName: 'AI-Concierge',
        customerId: sheet.customer,
        customerEphemeralKeySecret: sheet.ephemeralKey,
        paymentIntentClientSecret: sheet.paymentIntent,
        returnURL: 'aiconcierge://stripe-redirect',
      });
      if (init.error) {
        throw new Error(init.error.message);
      }

      const presented = await stripeSheet.presentPaymentSheet();
      if (presented.error) {
        // User cancelled or card was declined. "Canceled" is a no-op.
        if (!/cancel/i.test(presented.error.message)) {
          show(presented.error.message, 'error');
        }
        return;
      }

      // Force the backend to reconcile from Stripe so the local row flips
      // INCOMPLETE → ACTIVE before the next guarded call. Webhook may not be
      // wired in local dev; this makes the flow work either way.
      try {
        await refreshSubscription();
        // Refresh the cached user so a cold start lands the user on /connect
        // (or further) instead of /plan based on stale data.
        const me = await getMe();
        await refreshUser(me);
      } catch {
        // Non-fatal: the webhook may still arrive shortly.
      }

      show('Subscription active. Connect your CRM next.', 'success');
      await continueAfterPlan();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message || 'Could not start checkout. Please try again.'
          : err instanceof Error
            ? err.message
            : 'Could not start checkout. Please try again.';
      show(message, 'error');
    } finally {
      setIsSubscribing(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.backButton} onPress={() => router.replace('/signup')}>
          <MaterialIcons name="arrow-back" size={22} color="#202124" />
        </Pressable>

        <View style={styles.headerIcon}>
          <MaterialIcons name="workspace-premium" size={34} color="#1A73E8" />
        </View>
        <Text style={styles.title}>Choose your CRM plan</Text>
        <Text style={styles.subtitle}>
          One subscription = one CRM integration. Pick the CRM you want your voice AI to drive.
        </Text>

        <View style={styles.planList}>
          {displayPlans.map((card) => {
            const isSelected = selectedPlan === card.id;
            const live = card.live;

            return (
              <Pressable
                key={card.id}
                style={[styles.planCard, isSelected && styles.selectedPlanCard]}
                onPress={() => setSelectedPlan(card.id)}>
                <View style={styles.planHeader}>
                  <View style={styles.planTitleRow}>
                    <View style={styles.planIcon}>
                      <MaterialIcons name={card.icon} size={22} color="#1A73E8" />
                    </View>
                    <View style={styles.planTitleCopy}>
                      <Text style={styles.planName}>{card.name}</Text>
                      {card.description ? (
                        <Text style={styles.planDescription}>{card.description}</Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.pricePill}>
                    {live ? (
                      <>
                        <Text style={styles.price}>{live.monthlyPriceDisplay}</Text>
                        <Text style={styles.priceMeta}>/mo</Text>
                      </>
                    ) : (
                      <View style={styles.priceSkeleton}>
                        <ActivityIndicator size="small" color="#1A73E8" />
                      </View>
                    )}
                  </View>
                </View>

                {live ? (
                  <View style={styles.featuresList}>
                    {live.features.map((feature) => (
                      <View key={feature} style={styles.featureRow}>
                        <MaterialIcons name="check-circle" size={20} color="#34A853" />
                        <Text style={styles.featureText}>{feature}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.featuresList}>
                    <View style={styles.featureSkeletonRow} />
                    <View style={styles.featureSkeletonRow} />
                    <View style={styles.featureSkeletonRow} />
                  </View>
                )}

                <View style={[styles.radio, isSelected && styles.selectedRadio]}>
                  {isSelected ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={[
            styles.primaryButton,
            (isSubscribing || !canSubscribe) && styles.primaryButtonDisabled,
          ]}
          onPress={subscribeToActivePlan}
          disabled={isSubscribing || !canSubscribe}>
          {isSubscribing || !canSubscribe ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <MaterialIcons name="lock" size={20} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Subscribe with Stripe</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.checkoutHint}>
          Card details are collected securely inside Stripe. No card data touches our servers.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFF',
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: 24,
    paddingBottom: 42,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 14,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginBottom: 22,
    width: 44,
  },
  headerIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  title: {
    color: '#202124',
    fontSize: 34,
    fontWeight: '600',
    letterSpacing: -1,
    marginTop: 22,
  },
  subtitle: {
    color: '#5F6368',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
  },
  planList: {
    gap: 16,
    marginTop: 28,
  },
  planCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  selectedPlanCard: {
    borderColor: '#1A73E8',
    shadowColor: '#1A73E8',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
  },
  planHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  planTitleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  planIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  planTitleCopy: {
    flex: 1,
  },
  planName: {
    color: '#202124',
    fontSize: 18,
    fontWeight: '600',
  },
  planDescription: {
    color: '#5F6368',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  pricePill: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 18,
    minHeight: 50,
    minWidth: 64,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  priceSkeleton: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
  },
  price: {
    color: '#1A73E8',
    fontSize: 22,
    fontWeight: '600',
  },
  priceMeta: {
    color: '#5F6368',
    fontSize: 11,
    fontWeight: '600',
  },
  featuresList: {
    gap: 10,
    marginTop: 18,
  },
  featureRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  featureSkeletonRow: {
    backgroundColor: '#F1F3F4',
    borderRadius: 6,
    height: 14,
    width: '70%',
  },
  featureText: {
    color: '#3C4043',
    fontSize: 14,
    fontWeight: '600',
  },
  radio: {
    alignItems: 'center',
    borderColor: '#DADCE0',
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 18,
    bottom: 18,
    width: 24,
  },
  selectedRadio: {
    borderColor: '#1A73E8',
  },
  radioDot: {
    backgroundColor: '#1A73E8',
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 58,
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  checkoutHint: {
    color: '#5F6368',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    textAlign: 'center',
  },
});
