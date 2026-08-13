import type { PlanCode } from '@/lib/api/types';

// Public surface mirrored by the native implementation. Kept here as the
// single source of truth so callers don't have to maintain two type imports.
//
// Why `ready`: the native side needs an async connect to StoreKit before any
// other call works. UI uses this to gate the Subscribe button instead of
// reading platform-specific flags.
//
// Why `products` keyed by productId: the screen looks up prices/titles by
// `Plan.appleProductId`, never by SKU position in an array. A map keeps the
// call site one indexed-lookup instead of a `.find`.
export type AppleIapProduct = {
  productId: string;
  displayPrice: string;
  title: string;
};

export type AppleIapResult = {
  jwsRepresentation: string;
  productId: string;
  transactionId: string;
};

export type AppleIapHook = {
  ready: boolean;
  products: Record<string, AppleIapProduct>;
  // Resolves with the JWS to post to /billing/apple/verify.
  // Rejects on user-cancel with a message containing "cancel" so the call
  // site can swallow it cleanly.
  buy: (planCode: PlanCode, productId: string) => Promise<AppleIapResult>;
  // Resolves with the JWS of the most recent active subscription for the
  // requested product, or null if the user has no active Apple subscription
  // for this app.
  restore: (productId: string) => Promise<AppleIapResult | null>;
};

// Web / Android fallback. expo-iap is iOS-native; callers must Platform.OS
// guard before touching `buy` / `restore`, but they still call this hook
// unconditionally because hooks can't be conditional. Returning a no-op
// shape keeps the call sites simple — `ready` stays false on non-iOS so the
// Subscribe-with-Apple CTA never enables.
export function useAppleIap(): AppleIapHook {
  return {
    ready: false,
    products: {},
    buy: async () => {
      throw new Error('Apple In-App Purchase is only available on iOS.');
    },
    restore: async () => null,
  };
}
