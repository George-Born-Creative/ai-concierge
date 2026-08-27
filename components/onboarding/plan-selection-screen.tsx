import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PageHeader } from '@/components/page-header';
import { ScreenShell } from '@/components/screen';
import {
  UiControlHeights,
  UiRadii,
  UiSpacing,
  UiTypography,
} from '@/constants/theme';
import { useAppTheme } from '@/lib/theme/theme-provider';
import { getMe } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import {
  createPaymentSheet,
  refreshSubscription,
  restoreApplePurchase,
  verifyAppleReceipt,
} from '@/lib/api/payment';
import { listPlans } from '@/lib/api/plans';
import type { CrmProvider, PlanCode, PlanListItem } from '@/lib/api/types';
import { setOAuthReturnFrom } from '@/lib/oauth';
import {
  PLAN_CODE_FOR_PROVIDER,
  hasAnyActivePlan,
  hasCrmEntitlement,
  providerForPlanCode,
  routeForUser,
} from '@/lib/onboarding-route';
import { getUser, refreshUser } from '@/lib/session';
import { useToast } from '@/lib/toast';

import { PaymentMethodSheet, type PaymentMethod } from './payment-method-sheet';
import { useAppleIap } from './use-apple-iap';
import { useStripePaymentSheet } from './use-stripe-payment-sheet';

// iOS offers BOTH payment rails: tapping Subscribe opens a sheet where the
// user picks Apple In-App Purchase or Stripe (card). Stripe is the cheaper
// option (no Apple fee) and the sheet surfaces that discount. Android/web
// only have Stripe, so they skip the sheet and go straight to PaymentSheet.
const IS_IOS = Platform.OS === 'ios';

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
  const { colors } = useAppTheme();
  const router = useRouter();
  const { show } = useToast();
  const { from, provider } = useLocalSearchParams<{
    from?: string;
    provider?: string;
  }>();
  const fromCrm = from === 'crm';
  const lockedProvider: CrmProvider | null =
    fromCrm && (provider === 'ghl' || provider === 'hubspot') ? provider : null;
  const lockedPlan: PlanCode | null = lockedProvider
    ? PLAN_CODE_FOR_PROVIDER[lockedProvider]
    : null;
  const stripeSheet = useStripePaymentSheet();
  const appleIap = useAppleIap();
  const [selectedPlan, setSelectedPlan] = useState<PlanCode>(
    lockedPlan ?? 'ghl-pro',
  );

  useEffect(() => {
    if (lockedPlan) setSelectedPlan(lockedPlan);
  }, [lockedPlan]);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [plans, setPlans] = useState<PlanListItem[] | null>(null);
  // iOS payment-method picker state. `paymentBusy` marks which rail is
  // mid-checkout so the sheet shows a spinner on that row while keeping the
  // other one tappable as a fallback.
  const [paymentSheetVisible, setPaymentSheetVisible] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState<PaymentMethod | null>(null);

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

  // The card headline shows the best available price — i.e. the Stripe
  // (no-Apple-fee) price on every platform. The per-rail breakdown (and the
  // higher Apple price) is shown in the payment-method sheet on iOS.
  const cardPriceDisplay = useCallback(
    (live: PlanListItem | null): string | null =>
      live ? live.monthlyPriceDisplay : null,
    [],
  );

  // Whole-number percent the Stripe price saves vs the Apple IAP price.
  // Null when there's no real discount (prices equal, or the plan has no
  // Apple price). Computed from the cent fields so the badge stays accurate
  // regardless of display rounding.
  const stripeSavingsPercent = useCallback(
    (live: PlanListItem | null): number | null => {
      if (!live || live.applePrice == null) return null;
      if (live.applePrice <= live.monthlyPrice) return null;
      return Math.round(
        ((live.applePrice - live.monthlyPrice) / live.applePrice) * 100,
      );
    },
    [],
  );

  // The Subscribe button only needs the live backend plan: on iOS it opens
  // the payment-method sheet (which gates Apple-vs-Stripe availability
  // individually), and on Android it goes straight to Stripe. We no longer
  // block the whole button on StoreKit readiness — Stripe stays available
  // even if Apple IAP can't load.
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
      if (fromCrm) {
        const nextProvider = lockedProvider ?? providerForPlanCode(selectedPlan);
        setOAuthReturnFrom('crm');
        router.replace({
          pathname: '/connect',
          params: { from: 'crm', provider: nextProvider },
        });
        return;
      }
      router.replace(routeForUser(profile));
    },
    [fromCrm, lockedProvider, router, selectedPlan],
  );

  // Subscribe button entry point. iOS opens the payment-method sheet so the
  // user can choose Apple or Stripe; Android goes straight to Stripe; web has
  // no native checkout.
  function openCheckout() {
    if (!active || !active.live) {
      show('Plans are still loading. Please try again in a moment.', 'error');
      return;
    }
    if (IS_IOS) {
      setPaymentSheetVisible(true);
      return;
    }
    if (Platform.OS === 'web') {
      show('Stripe checkout is only available on the iOS / Android build.', 'info');
      return;
    }
    void handleSubscribe('stripe');
  }

  // Runs the chosen payment rail. Shared "already subscribed" short-circuit
  // up front, then dispatches to the Apple or Stripe flow. On error we keep
  // the sheet open (when shown) so the user can fall back to the other rail.
  async function handleSubscribe(method: PaymentMethod) {
    if (!active || !active.live) {
      show('Plans are still loading. Please try again in a moment.', 'error');
      return;
    }
    setPaymentBusy(method);
    setIsSubscribing(true);
    try {
      let user = getUser();
      try {
        user = await getMe();
        await refreshUser(user);
      } catch {
        // Fall back to cached profile if the network hiccups.
      }

      if (fromCrm) {
        if (user && hasCrmEntitlement(user, providerForPlanCode(active.id))) {
          const planName = active.name;
          show(`You already have an active subscription (${planName}).`, 'info');
          setPaymentSheetVisible(false);
          await continueAfterPlan(user);
          return;
        }
      } else if (user && hasAnyActivePlan(user)) {
        const planName = user.plan?.name ?? 'your plan';
        show(`You already have an active subscription (${planName}).`, 'info');
        setPaymentSheetVisible(false);
        await continueAfterPlan(user);
        return;
      }

      if (method === 'apple') {
        await subscribeWithApple(active.id, active.live);
      } else {
        await subscribeWithStripe(active.id);
      }
      setPaymentSheetVisible(false);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message || 'Could not start checkout. Please try again.'
          : err instanceof Error
            ? err.message
            : 'Could not start checkout. Please try again.';
      // Swallow obvious user-cancel paths — StoreKit and Stripe both surface
      // these as throws and the toast would just be noise. Leave the sheet
      // open so the user can pick the other payment method.
      if (!/cancel/i.test(message)) {
        show(message, 'error');
      }
    } finally {
      setPaymentBusy(null);
      setIsSubscribing(false);
    }
  }

  // Android + (later) web Stripe PaymentSheet path. Unchanged from before
  // Step 4 except for being extracted to a function so the iOS branch can
  // live next to it.
  async function subscribeWithStripe(planCode: PlanCode) {
    if (!stripeSheet) {
      show('Payment SDK is still loading. Please try again in a moment.', 'error');
      return;
    }

    const sheet = await createPaymentSheet({ planCode });

    const init = await stripeSheet.initPaymentSheet({
      merchantDisplayName: 'AI-Concierge',
      customerId: sheet.customer,
      customerEphemeralKeySecret: sheet.ephemeralKey,
      paymentIntentClientSecret: sheet.paymentIntent,
      returnURL: 'aiconcierge://stripe-redirect',
      appearance: {
        colors: {
          primary: colors.primary,
          background: colors.background,
          componentBackground: colors.inputBackground,
          componentBorder: colors.inputBorder,
          componentDivider: colors.divider,
          primaryText: colors.textPrimary,
          secondaryText: colors.textSecondary,
          componentText: colors.textPrimary,
          placeholderText: colors.placeholder,
          icon: colors.icon,
          error: colors.danger,
        },
        shapes: {
          borderRadius: 12,
          borderWidth: 1,
        },
        primaryButton: {
          colors: {
            background: colors.primary,
            text: colors.onPrimary,
            border: colors.primary,
          },
          shapes: {
            borderRadius: 12,
          },
        },
      },
    });
    if (init.error) {
      throw new Error(init.error.message);
    }

    const presented = await stripeSheet.presentPaymentSheet();
    if (presented.error) {
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
      const me = await getMe();
      await refreshUser(me);
    } catch {
      // Non-fatal: the webhook may still arrive shortly.
    }

    show('Subscription active. Connect your CRM next.', 'success');
    await continueAfterPlan();
  }

  // iOS Apple IAP path. The expo-iap purchase listener resolves the
  // `buy(...)` promise with the JWS once StoreKit confirms the sale, then
  // we send it to the backend's verifier (which both validates the receipt
  // and writes the Subscription row). Only after the backend ACKs do we
  // mark the StoreKit transaction finished — leaving it pending if verify
  // throws so StoreKit replays the transaction on next launch.
  async function subscribeWithApple(planCode: PlanCode, live: PlanListItem) {
    if (!live.appleProductId) {
      show('This plan is not available on iOS yet. Please try the web checkout.', 'error');
      return;
    }
    if (!appleIap.ready) {
      show('Apple Store is still connecting. Please try again in a moment.', 'error');
      return;
    }

    const { jwsRepresentation } = await appleIap.buy(planCode, live.appleProductId);
    await verifyAppleReceipt({ planCode, jwsRepresentation });

    try {
      const me = await getMe();
      await refreshUser(me);
    } catch {
      // Non-fatal: the row is already correct on the backend, the next
      // /me call will pick it up.
    }

    show('Subscription active. Connect your CRM next.', 'success');
    await continueAfterPlan();
  }

  // Restore Purchases — required by App Review. Only meaningful on iOS;
  // surfaced as a small link on iOS only (see render branch below).
  async function restoreApple() {
    if (!IS_IOS) return;
    if (!active || !active.live) {
      show('Plans are still loading. Please try again in a moment.', 'error');
      return;
    }
    if (!active.live.appleProductId) {
      show('This plan is not available on iOS yet.', 'error');
      return;
    }
    if (!appleIap.ready) {
      show('Apple Store is still connecting. Please try again in a moment.', 'error');
      return;
    }
    setIsRestoring(true);
    try {
      const result = await appleIap.restore(active.live.appleProductId);
      if (!result) {
        show('No active Apple subscription found for this plan.', 'info');
        return;
      }
      await restoreApplePurchase({
        planCode: active.id,
        jwsRepresentation: result.jwsRepresentation,
      });
      try {
        const me = await getMe();
        await refreshUser(me);
      } catch {
        // Non-fatal.
      }
      show('Subscription restored.', 'success');
      await continueAfterPlan();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message || 'Could not restore. Please try again.'
          : err instanceof Error
            ? err.message
            : 'Could not restore. Please try again.';
      show(message, 'error');
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <ScreenShell>
      <PageHeader
        title="Choose plan"
        showBack
        onBack={() => router.replace(fromCrm ? '/settings/crm' : '/signup')}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
        overScrollMode="never">
        <View style={styles.headerIcon}>
          <MaterialIcons name="workspace-premium" size={28} color={colors.primary} />
        </View>
        <Text style={styles.title}>{fromCrm ? 'Add a CRM plan' : 'Choose your CRM plan'}</Text>
        <Text style={styles.subtitle}>
          {fromCrm
            ? 'Adding this plan does not cancel your existing CRM subscription. After you pay, you will connect this CRM next.'
            : 'One subscription = one CRM. Adding a second plan later does not cancel the first.'}
        </Text>

        <View style={styles.planList}>
          {displayPlans.map((card) => {
            const isSelected = selectedPlan === card.id;
            const live = card.live;
            const lockedOut = Boolean(lockedPlan && card.id !== lockedPlan);

            return (
              <Pressable
                key={card.id}
                style={[
                  styles.planCard,
                  isSelected && styles.selectedPlanCard,
                  lockedOut && styles.lockedPlanCard,
                ]}
                onPress={() => {
                  if (lockedOut) return;
                  setSelectedPlan(card.id);
                }}
                disabled={lockedOut}>
                <View style={styles.planHeader}>
                  <View style={styles.planTitleRow}>
                    <View style={styles.planIcon}>
                      <MaterialIcons name={card.icon} size={22} color={colors.primary} />
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
                        <Text style={styles.price}>{cardPriceDisplay(live)}</Text>
                        <Text style={styles.priceMeta}>/mo</Text>
                      </>
                    ) : (
                      <View style={styles.priceSkeleton}>
                        <ActivityIndicator size="small" color={colors.primary} />
                      </View>
                    )}
                  </View>
                </View>

                {live ? (
                  <View style={styles.featuresList}>
                    {live.features.map((feature) => (
                      <View key={feature} style={styles.featureRow}>
                        <MaterialIcons name="check-circle" size={20} color={colors.success} />
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
            (isSubscribing || isRestoring || !canSubscribe) && styles.primaryButtonDisabled,
          ]}
          onPress={openCheckout}
          disabled={isSubscribing || isRestoring || !canSubscribe}>
          {isSubscribing || !canSubscribe ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <>
              <MaterialIcons name="lock" size={20} color={colors.onPrimary} />
              <Text style={styles.primaryButtonText}>
                {IS_IOS ? 'Subscribe' : 'Subscribe with Stripe'}
              </Text>
            </>
          )}
        </Pressable>
        <Text style={styles.checkoutHint}>
          {IS_IOS
            ? 'Choose Apple or pay by card with Stripe. Card checkout is discounted — no Apple fee.'
            : 'Card details are collected securely inside Stripe. No card data touches our servers.'}
        </Text>

        {IS_IOS ? (
          <Pressable
            style={styles.restoreButton}
            onPress={restoreApple}
            disabled={isSubscribing || isRestoring || !canSubscribe}>
            {isRestoring ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Text style={styles.restoreButtonText}>Restore Purchases</Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>

      {IS_IOS ? (
        <PaymentMethodSheet
          visible={paymentSheetVisible}
          planName={active?.name ?? 'Your plan'}
          applePriceDisplay={
            active?.live?.applePriceDisplay ??
            active?.live?.monthlyPriceDisplay ??
            null
          }
          stripePriceDisplay={active?.live?.monthlyPriceDisplay ?? null}
          savingsPercent={stripeSavingsPercent(active?.live ?? null)}
          appleAvailable={Boolean(active?.live?.appleProductId) && appleIap.ready}
          appleUnavailableReason={
            !active?.live?.appleProductId
              ? 'Not available on iOS yet'
              : !appleIap.ready
                ? 'Connecting to the App Store…'
                : null
          }
          stripeAvailable={Boolean(stripeSheet)}
          busy={paymentBusy}
          onSelectApple={() => void handleSubscribe('apple')}
          onSelectStripe={() => void handleSubscribe('stripe')}
          onClose={() => setPaymentSheetVisible(false)}
        />
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    maxWidth: 700,
    paddingBottom: UiSpacing.xxxl,
    paddingHorizontal: UiSpacing.lg,
    paddingTop: UiSpacing.xl,
    width: '100%',
  },
  headerIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: UiRadii.icon,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  title: {
    color: '#202124',
    fontSize: UiTypography.display.fontSize,
    fontWeight: '600',
    letterSpacing: -0.7,
    lineHeight: UiTypography.display.lineHeight,
    marginTop: UiSpacing.lg,
  },
  subtitle: {
    color: '#5F6368',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    marginTop: UiSpacing.sm,
  },
  planList: {
    gap: UiSpacing.md,
    marginTop: UiSpacing.xl,
  },
  planCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    padding: UiSpacing.md,
  },
  selectedPlanCard: {
    borderColor: '#1A73E8',
    shadowColor: '#1A73E8',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
  },
  lockedPlanCard: {
    opacity: 0.55,
  },
  planHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: UiSpacing.sm,
    justifyContent: 'space-between',
  },
  planTitleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: UiSpacing.sm,
  },
  planIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: UiRadii.icon,
    height: UiControlHeights.iconButton,
    justifyContent: 'center',
    width: UiControlHeights.iconButton,
  },
  planTitleCopy: {
    flex: 1,
  },
  planName: {
    color: '#202124',
    fontSize: UiTypography.cardHeading.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.cardHeading.lineHeight,
  },
  planDescription: {
    color: '#5F6368',
    fontSize: UiTypography.label.fontSize,
    lineHeight: 18,
    marginTop: UiSpacing.xxs,
  },
  pricePill: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: UiRadii.control,
    justifyContent: 'center',
    minHeight: UiControlHeights.button,
    minWidth: 62,
    paddingHorizontal: UiSpacing.sm,
    paddingVertical: UiSpacing.xs,
  },
  priceSkeleton: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
  },
  price: {
    color: '#1A73E8',
    fontSize: UiTypography.sectionHeading.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.sectionHeading.lineHeight,
  },
  priceMeta: {
    color: '#5F6368',
    fontSize: UiTypography.caption.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.caption.lineHeight,
  },
  featuresList: {
    gap: UiSpacing.sm,
    marginTop: UiSpacing.md,
  },
  featureRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: UiSpacing.sm,
  },
  featureSkeletonRow: {
    backgroundColor: '#F1F3F4',
    borderRadius: 6,
    height: 14,
    width: '70%',
  },
  featureText: {
    color: '#3C4043',
    fontSize: UiTypography.bodySmall.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.bodySmall.lineHeight,
  },
  radio: {
    alignItems: 'center',
    borderColor: '#DADCE0',
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: UiSpacing.md,
    bottom: UiSpacing.md,
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
    borderRadius: UiRadii.control,
    flexDirection: 'row',
    gap: UiSpacing.sm,
    justifyContent: 'center',
    marginTop: UiSpacing.xl,
    minHeight: UiControlHeights.button,
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: UiTypography.button.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.button.lineHeight,
  },
  checkoutHint: {
    color: '#5F6368',
    fontSize: UiTypography.caption.fontSize,
    lineHeight: UiTypography.caption.lineHeight,
    marginTop: UiSpacing.sm,
    textAlign: 'center',
  },
  restoreButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: UiSpacing.xs,
    minHeight: UiControlHeights.button,
  },
  restoreButtonText: {
    color: '#1A73E8',
    fontSize: UiTypography.button.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.button.lineHeight,
    textDecorationLine: 'underline',
  },
});
