import type { ReactElement } from 'react';

type Props = {
  children: ReactElement | ReactElement[];
};

export function StripeWrapper({ children }: Props) {
  return <>{children}</>;
}
