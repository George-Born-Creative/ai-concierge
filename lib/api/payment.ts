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
