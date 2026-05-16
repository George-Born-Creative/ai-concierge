import { useStripe } from '@stripe/stripe-react-native/lib/commonjs/hooks/useStripe';

export type PaymentSheetHook = ReturnType<typeof useStripe> | null;

export function useStripePaymentSheet(): PaymentSheetHook {
  return useStripe();
}
