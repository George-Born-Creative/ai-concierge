import { requireOptionalNativeModule } from 'expo-modules-core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  getAvailablePurchases,
  requestPurchase,
  useIAP,
  type ExpoPurchaseError,
  type Purchase,
} from 'expo-iap';

import type { PlanCode } from '@/lib/api/types';

import type { AppleIapHook, AppleIapProduct, AppleIapResult } from './use-apple-iap';

// expo-iap's `useIAP` eagerly reaches into the 'ExpoIap' native module on
// mount (to register the purchase listener). When that module isn't compiled
// into the running binary — i.e. the app is opened in Expo Go, or in a dev
// client that was built before expo-iap was added — that access throws
// "Cannot find native module 'ExpoIap'" and crashes the screen. We probe for
// the module ONCE at import time (its presence can't change at runtime) and,
// when it's absent, swap in a no-op hook that never calls `useIAP`. The plan
// screen then simply shows Apple IAP as unavailable and the user pays with
// Stripe. To actually use Apple IAP, rebuild the native app (expo prebuild +
// a dev/EAS build); a JS-only reload (expo start -c) won't add the module.
const IAP_NATIVE_AVAILABLE = requireOptionalNativeModule('ExpoIap') != null;

// Hard-coded mapping of our plan codes to App Store Connect product
// identifiers. The same strings live on `Plan.appleProductId` in the
// backend (seeded by prisma/seed.ts) — we duplicate them here only to
// boot `fetchProducts` with the right SKUs before the live /plans
// response is available. The screen still cross-checks against the
// backend-returned `appleProductId` before kicking off a purchase, so a
// mismatch here can't cause a wrong-plan charge.
const APPLE_PRODUCT_IDS: Record<PlanCode, string> = {
  'ghl-pro': 'com.daveget.aiconcierge.ghl_pro_monthly',
  'hubspot-pro': 'com.daveget.aiconcierge.hubspot_pro_monthly',
};

const ALL_PRODUCT_IDS = Object.values(APPLE_PRODUCT_IDS);

// StoreKit / expo-iap throws a terse "SKU not found" (and a few sibling
// phrasings) when requestPurchase references a product that wasn't loaded —
// e.g. the product isn't live in App Store Connect, the simulator has no
// StoreKit config file wired into the scheme, or the initial fetchProducts
// call failed. That message is useless to an end user, so we translate the
// whole family into one actionable sentence that nudges them to the Stripe
// option (which doesn't depend on StoreKit). User-cancel errors are left
// untouched so the call site can keep swallowing them.
function normalizePurchaseError(err: unknown): Error {
  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (
    /sku\s*not\s*found|product\s*not\s*found|not\s*found|invalid\s*product|cannot\s*find|unknown\s*product/i.test(
      raw,
    )
  ) {
    return new Error(
      "This subscription isn't available from the App Store right now. Please choose “Pay with card” instead.",
    );
  }
  return err instanceof Error ? err : new Error('Apple purchase failed');
}

// One-shot promise registry keyed by productId. expo-iap delivers purchase
// results via a listener (not the requestPurchase return value), so we need
// a way to bridge "user tapped Buy" → "purchase event for this productId
// arrived" → "resolve the promise the screen is awaiting".
//
// We keep this outside React state because the listener and the resolver
// belong to two different async lifecycles (StoreKit transactions can
// arrive on app launch even when nothing is awaiting them — those are
// background renewals, handled separately). A ref-managed Map keeps the
// resolution local to in-flight buys.
type PendingPurchase = {
  resolve: (result: AppleIapResult) => void;
  reject: (err: Error) => void;
  planCode: PlanCode;
};

function useAppleIapNative(): AppleIapHook {
  // The web bundle never reaches this file (use-apple-iap.ts is picked
  // instead via Platform extensions). On Android the file still loads but
  // expo-iap's iOS bits are inert; we short-circuit `ready` to false.
  const isIos = Platform.OS === 'ios';

  const pendingRef = useRef(new Map<string, PendingPurchase>());

  // Captures the most recent processed transactionId per productId so we
  // can deduplicate StoreKit replay events (StoreKit re-delivers the same
  // transaction across app launches until finishTransaction is called —
  // the backend finishes it after verify, but until then we may see the
  // event twice).
  const lastResolvedRef = useRef(new Map<string, string>());

  // SKUs StoreKit has actually confirmed it knows about. Populated from the
  // reactive `products` array below. `buy()` reads this to decide whether it
  // should attempt a last-chance refetch before kicking off a purchase.
  const loadedSkusRef = useRef(new Set<string>());

  const { connected, products, fetchProducts } = useIAP({
    onPurchaseSuccess: (purchase: Purchase) => {
      // expo-iap unions iOS + Android Purchase shapes; on iOS purchaseToken
      // carries the StoreKit 2 JWS we need for backend verification.
      const productId = purchase.productId;
      const transactionId = purchase.transactionId;
      const jws = purchase.purchaseToken;
      if (!productId || !jws || !transactionId) return;

      const lastTx = lastResolvedRef.current.get(productId);
      if (lastTx === transactionId) {
        // Already handed this transaction back; ignore the replay.
        return;
      }
      lastResolvedRef.current.set(productId, transactionId);

      const pending = pendingRef.current.get(productId);
      if (!pending) {
        // Background renewal / promoted-product purchase / replay after
        // a previous session — nothing to resolve. Leaving the transaction
        // unfinished is intentional: the backend's ASN webhook will pick
        // up the state change; the next foreground purchase flow will
        // either finish it via a fresh verify or leave it for StoreKit's
        // retry queue.
        return;
      }
      pendingRef.current.delete(productId);
      pending.resolve({
        jwsRepresentation: jws,
        productId,
        transactionId,
      });
    },
    onPurchaseError: (error: ExpoPurchaseError) => {
      // PurchaseError doesn't always carry a productId; if it does, reject
      // that specific pending entry. Otherwise reject everything — the
      // store has shut down our flow and any other in-flight buys are
      // dead too.
      const targetProductId = error.productId ?? null;
      if (targetProductId) {
        const pending = pendingRef.current.get(targetProductId);
        if (pending) {
          pendingRef.current.delete(targetProductId);
          pending.reject(normalizePurchaseError(error));
        }
        return;
      }
      const normalized = normalizePurchaseError(error);
      pendingRef.current.forEach((p) => p.reject(normalized));
      pendingRef.current.clear();
    },
  });

  // Kick off product fetching as soon as StoreKit reports connected. We
  // don't await here — the hook surface exposes a `ready` boolean that
  // flips true once both connection + fetch finish, and the UI gates the
  // Subscribe button on that.
  const [productsFetched, setProductsFetched] = useState(false);
  useEffect(() => {
    if (!isIos) return;
    if (!connected) return;
    if (productsFetched) return;
    let cancelled = false;
    fetchProducts({ skus: ALL_PRODUCT_IDS, type: 'subs' })
      .catch(() => {
        // Non-fatal — `products` stays empty and the screen will show
        // backend-derived prices anyway. A retry happens automatically
        // if `connected` flips false → true again.
      })
      .finally(() => {
        if (cancelled) return;
        setProductsFetched(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isIos, connected, productsFetched, fetchProducts]);

  // Re-index the iOS subscription array as a productId → display payload
  // map so callers can read prices in O(1).
  const productsByCode = useMemo<Record<string, AppleIapProduct>>(() => {
    const out: Record<string, AppleIapProduct> = {};
    for (const p of products) {
      out[p.id] = {
        productId: p.id,
        displayPrice: p.displayPrice ?? '',
        title: p.title ?? p.id,
      };
    }
    return out;
  }, [products]);

  // Keep the loaded-SKU set in sync with whatever StoreKit has returned so
  // far. `buy()` uses it to skip a redundant refetch on the happy path.
  useEffect(() => {
    for (const p of products) loadedSkusRef.current.add(p.id);
  }, [products]);

  const buy = useCallback(
    async (planCode: PlanCode, productId: string): Promise<AppleIapResult> => {
      if (!isIos) {
        throw new Error('Apple In-App Purchase is only available on iOS.');
      }
      if (!connected) {
        throw new Error('Apple Store not ready yet. Please try again in a moment.');
      }

      // If the initial fetch (on connect) failed or hasn't surfaced this SKU
      // yet, give StoreKit one more chance to load it before we reference it.
      // Without a loaded product, requestPurchase throws the cryptic "SKU not
      // found" — this refetch removes the most common false negative. Any
      // failure here is non-fatal: the requestPurchase error path below
      // normalizes whatever StoreKit ultimately reports.
      if (!loadedSkusRef.current.has(productId)) {
        try {
          await fetchProducts({ skus: [productId], type: 'subs' });
        } catch {
          // ignore — surfaced (normalized) by the requestPurchase path below
        }
      }

      // If a previous buy for the same productId is still pending, reject
      // it before starting a new one — the UI should never have two open
      // payment sheets but defensive cleanup keeps the Map well-formed.
      const existing = pendingRef.current.get(productId);
      if (existing) {
        existing.reject(new Error('Purchase superseded by a new attempt'));
      }

      return new Promise<AppleIapResult>((resolve, reject) => {
        pendingRef.current.set(productId, { resolve, reject, planCode });
        requestPurchase({
          request: {
            ios: { sku: productId },
          },
          type: 'subs',
        }).catch((err: unknown) => {
          // Synchronous rejections from requestPurchase (e.g. not-prepared,
          // "SKU not found") never trigger the listener path, so we have to
          // clear the pending entry and normalize the error here too.
          const pending = pendingRef.current.get(productId);
          if (pending) {
            pendingRef.current.delete(productId);
            pending.reject(normalizePurchaseError(err));
          }
        });
      });
    },
    [isIos, connected, fetchProducts],
  );

  const restore = useCallback(
    async (productId: string): Promise<AppleIapResult | null> => {
      if (!isIos) return null;
      // expo-iap docs: restorePurchases() refreshes StoreKit; we then call
      // getAvailablePurchases() to read what came back. Both throw on
      // failure — callers wrap in try/catch and surface a toast.
      const purchases = await getAvailablePurchases({
        // iOS only: limit the result set to subscriptions that are
        // currently active. We're looking up the JWS the backend will use
        // to recreate the local Subscription row, so an expired one is
        // useless here.
        onlyIncludeActiveItemsIOS: true,
      });
      const match = purchases.find((p) => p.productId === productId);
      if (!match || !match.purchaseToken || !match.transactionId) {
        return null;
      }
      return {
        jwsRepresentation: match.purchaseToken,
        productId: match.productId,
        transactionId: match.transactionId,
      };
    },
    [isIos],
  );

  const ready = isIos && connected && productsFetched;

  return { ready, products: productsByCode, buy, restore };
}

// No-op fallback used when the 'ExpoIap' native module isn't in the running
// binary. Crucially this never calls `useIAP`, so it can't trip the
// "Cannot find native module" crash. `ready` stays false → the plan screen
// marks Apple unavailable and routes the user to Stripe.
function useAppleIapUnavailable(): AppleIapHook {
  return {
    ready: false,
    products: {},
    buy: async () => {
      throw new Error(
        "Apple In-App Purchase isn't available in this build. Please choose “Pay with card” instead.",
      );
    },
    restore: async () => null,
  };
}

// Pick the implementation once, at module load. Native-module availability is
// fixed for the process lifetime, so the selected hook is stable across
// renders and never violates the rules of hooks.
export const useAppleIap: () => AppleIapHook = IAP_NATIVE_AVAILABLE
  ? useAppleIapNative
  : useAppleIapUnavailable;
