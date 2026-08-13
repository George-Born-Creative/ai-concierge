import { Linking } from 'react-native';

import { apiRequest } from './client';
import type {
  CreatePaymentSheetRequest,
  CreatePaymentSheetResponse,
  VerifyAppleReceiptRequest,
  VerifyAppleReceiptResponse,
} from './types';

// Asks the backend to create (or reuse) a Stripe subscription in `incomplete`
// state and return the parameters needed by the mobile PaymentSheet.
export async function createPaymentSheet(
  data: CreatePaymentSheetRequest
): Promise<CreatePaymentSheetResponse> {
  return apiRequest<CreatePaymentSheetResponse>('/billing/payment-sheet', {
    method: 'POST',
    body: data,
  });
}

// Backend now returns `manageUrl` for Apple subscriptions because Apple owns
// the cancel lifecycle (we can't call an API to revoke; the user must do it
// in Settings → Subscriptions). UI branches on the response: when manageUrl
// is present, open it via Linking.openURL.
export async function cancelSubscription(): Promise<{
  canceled: boolean;
  manageUrl?: string;
}> {
  return apiRequest<{ canceled: boolean; manageUrl?: string }>(
    '/billing/subscription/cancel',
    {
      method: 'POST',
    },
  );
}

// Sends the StoreKit 2 JWS (purchaseToken on iOS Purchase objects) up to the
// backend's verifier for signature + bundle + product checks. On success the
// backend has already upserted the Subscription row with paymentProvider=APPLE,
// so callers should refresh the user profile right after.
export async function verifyAppleReceipt(
  data: VerifyAppleReceiptRequest,
): Promise<VerifyAppleReceiptResponse> {
  return apiRequest<VerifyAppleReceiptResponse>('/billing/apple/verify', {
    method: 'POST',
    body: data,
  });
}

// Apple "Restore Purchases" — required by App Review. The JWS we send is
// whatever StoreKit hands back from restorePurchases() + getAvailablePurchases()
// for the user's most recent active transaction on the requested plan.
// Server-side is the same `verifyAndUpsert` flow; keeping a separate function
// here so callers can tell the two flows apart in analytics and toasts.
export async function restoreApplePurchase(
  data: VerifyAppleReceiptRequest,
): Promise<VerifyAppleReceiptResponse> {
  return apiRequest<VerifyAppleReceiptResponse>('/billing/apple/restore', {
    method: 'POST',
    body: data,
  });
}

// Force the backend to pull the live Stripe status and flip the local row
// out of INCOMPLETE once the PaymentSheet confirms payment. Used so the next
// guarded call (e.g. /integrations/ghl/auth-url) finds an ACTIVE row even
// when Stripe webhooks aren't reaching local dev.
export async function refreshSubscription(): Promise<{ status: string }> {
  return apiRequest<{ status: string }>('/billing/subscription/refresh', {
    method: 'POST',
  });
}

// One-call helper for settings/profile UIs. The backend already branches on
// paymentProvider — Stripe subs return `{ canceled: true }` and Apple subs
// return `{ canceled: false, manageUrl: 'itms-apps://...' }`. For Apple we
// can't revoke server-side; we deep-link the user to iOS Manage
// Subscriptions where they can cancel themselves. The EXPIRED ASN will
// eventually flip our local row to CANCELED.
//
// Resolves to a discriminated union so call sites can render the right
// toast: 'canceled' for Stripe (immediate effect), 'managed' for Apple
// (user must complete the cancel in iOS Settings).
export type CancelOrManageResult =
  | { kind: 'canceled' }
  | { kind: 'managed'; manageUrl: string }
  | { kind: 'noop' };

export async function cancelOrManageSubscription(): Promise<CancelOrManageResult> {
  const response = await cancelSubscription();
  if (response.canceled) {
    return { kind: 'canceled' };
  }
  if (response.manageUrl) {
    // Linking.openURL handles itms-apps:// directly on iOS — no permission
    // prompt, no Safari hop. We don't await the URL open because Linking
    // resolves immediately on iOS; any failure is surfaced via the UI's
    // own catch block.
    void Linking.openURL(response.manageUrl).catch(() => {});
    return { kind: 'managed', manageUrl: response.manageUrl };
  }
  return { kind: 'noop' };
}
