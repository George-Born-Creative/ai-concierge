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
    appearance?: {
      colors?: {
        primary?: string;
        background?: string;
        componentBackground?: string;
        componentBorder?: string;
        componentDivider?: string;
        primaryText?: string;
        secondaryText?: string;
        componentText?: string;
        placeholderText?: string;
        icon?: string;
        error?: string;
      };
      shapes?: {
        borderRadius?: number;
        borderWidth?: number;
      };
      primaryButton?: {
        colors?: {
          background?: string;
          text?: string;
          border?: string;
        };
        shapes?: {
          borderRadius?: number;
        };
      };
    };
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
