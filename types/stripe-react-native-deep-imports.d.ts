declare module '@stripe/stripe-react-native/lib/commonjs/components/StripeProvider' {
  import { ComponentType, ReactElement } from 'react';

  export type StripeProviderProps = {
    children: ReactElement | ReactElement[];
    merchantIdentifier?: string;
    publishableKey: string;
    stripeAccountId?: string;
    threeDSecureParams?: unknown;
    urlScheme?: string;
  };

  export const StripeProvider: ComponentType<StripeProviderProps>;
}

declare module '@stripe/stripe-react-native/lib/commonjs/hooks/useStripe' {
  type StripeError = {
    message: string;
  };

  type InitPaymentSheetParams = {
    customerEphemeralKeySecret?: string;
    customerId?: string;
    merchantDisplayName: string;
    paymentIntentClientSecret: string;
    returnURL?: string;
  };

  type PaymentSheetResult = {
    error?: StripeError;
  };

  export function useStripe(): {
    initPaymentSheet(params: InitPaymentSheetParams): Promise<PaymentSheetResult>;
    presentPaymentSheet(): Promise<PaymentSheetResult>;
  };
}
