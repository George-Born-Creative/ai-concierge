import type { CreatePaymentSessionRequest, CreatePaymentSessionResponse } from './types';

/**
 * Calls the Stripe backend endpoint to create a PaymentIntent + ephemeral key.
 * The endpoint URL comes from EXPO_PUBLIC_STRIPE_PAYMENT_ENDPOINT so it can
 * point to localhost (dev) or your deployed backend (prod).
 */
export async function createPaymentSession(
  data: CreatePaymentSessionRequest
): Promise<CreatePaymentSessionResponse> {
  const endpoint = process.env.EXPO_PUBLIC_STRIPE_PAYMENT_ENDPOINT;

  if (!endpoint) {
    throw new Error(
      'EXPO_PUBLIC_STRIPE_PAYMENT_ENDPOINT is not set. Add it to your .env file.'
    );
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new Error(`Payment session error (${response.status}): ${text}`);
  }

  return response.json() as Promise<CreatePaymentSessionResponse>;
}
