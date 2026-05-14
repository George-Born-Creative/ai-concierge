import { StripeProvider } from '@stripe/stripe-react-native/lib/commonjs/components/StripeProvider';
import type { ReactElement } from 'react';

type Props = {
  children: ReactElement | ReactElement[];
};

export function StripeWrapper({ children }: Props) {
  return (
    <StripeProvider
      publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''}
      urlScheme="aiconcierge">
      {children}
    </StripeProvider>
  );
}
