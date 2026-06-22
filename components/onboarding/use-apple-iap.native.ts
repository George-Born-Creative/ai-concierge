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

export function useAppleIap(): AppleIapHook {
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
      const message = error.message || 'Apple purchase failed';
      if (targetProductId) {
        const pending = pendingRef.current.get(targetProductId);
        if (pending) {
          pendingRef.current.delete(targetProductId);
          pending.reject(new Error(message));
        }
        return;
      }
      pendingRef.current.forEach((p) => p.reject(new Error(message)));
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

  const buy = useCallback(
    (planCode: PlanCode, productId: string): Promise<AppleIapResult> => {
      if (!isIos) {
        return Promise.reject(
          new Error('Apple In-App Purchase is only available on iOS.'),
        );
      }
      if (!connected) {
        return Promise.reject(
          new Error('Apple Store not ready yet. Please try again in a moment.'),
        );
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
          // Synchronous rejections from requestPurchase (e.g. not-prepared)
          // never trigger the listener path, so we have to clear the
          // pending entry here too.
          const pending = pendingRef.current.get(productId);
          if (pending) {
            pendingRef.current.delete(productId);
            pending.reject(err instanceof Error ? err : new Error('Purchase failed'));
          }
        });
      });
    },
    [isIos, connected],
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
