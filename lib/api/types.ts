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
