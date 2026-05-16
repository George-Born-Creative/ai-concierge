import type { useStripe } from '@stripe/stripe-react-native/lib/commonjs/hooks/useStripe';

// Web fallback. `@stripe/stripe-react-native` is native-only, so on web we
// return `null` and callers must Platform.OS-guard before using it.
export type PaymentSheetHook = ReturnType<typeof useStripe> | null;

export function useStripePaymentSheet(): PaymentSheetHook {
  return null;
}
