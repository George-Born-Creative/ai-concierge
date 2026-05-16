// ─── Auth ────────────────────────────────────────────────────────────────────

export type SignUpRequest = {
  name: string;
  email: string;
  password: string;
};

export type SignInRequest = {
  email: string;
  password: string;
};

export type AuthResponse = {
  token: string;
  user: User;
};

export type CrmProvider = 'ghl' | 'hubspot';

export type UserPlan = {
  id: string;
  name: string;
  provider: CrmProvider;
  // 'incomplete' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'
  status: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  plan?: UserPlan | null;
  provider?: CrmProvider | null;
  hasIntegration?: boolean;
  hasOpenAIKey?: boolean;
  openAIKeyLast4?: string | null;
};

// ─── Billing ─────────────────────────────────────────────────────────────────

export type PlanCode = 'ghl-pro' | 'hubspot-pro';

// Matches POST /billing/payment-sheet on the backend. Field names line up 1:1
// with what @stripe/stripe-react-native's PaymentSheet expects.
export type CreatePaymentSheetRequest = {
  planCode: PlanCode;
};

export type CreatePaymentSheetResponse = {
  paymentIntent: string;
  ephemeralKey: string;
  customer: string;
  publishableKey: string;
};
