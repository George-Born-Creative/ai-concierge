import { apiRequest } from './client';
import type { CreatePaymentSheetRequest, CreatePaymentSheetResponse } from './types';

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

export async function cancelSubscription(): Promise<{ canceled: boolean }> {
  return apiRequest<{ canceled: boolean }>('/billing/subscription/cancel', {
    method: 'POST',
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
