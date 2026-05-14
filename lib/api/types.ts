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

export type User = {
  id: string;
  name: string;
  email: string;
  plan?: PlanId;
  ghlLocationId?: string;
  hasOpenAIKey?: boolean;
};

// ─── Plan ─────────────────────────────────────────────────────────────────────

export type PlanId = 'starter' | 'pro';

export type Plan = {
  id: PlanId;
  name: string;
  price: number;
  currency: string;
  features: string[];
};

export type SelectPlanRequest = {
  planId: PlanId;
};

export type SelectPlanResponse = {
  planId: PlanId;
  activatedAt: string;
};

// ─── Payment ──────────────────────────────────────────────────────────────────

export type CreatePaymentSessionRequest = {
  plan: PlanId;
};

export type CreatePaymentSessionResponse = {
  customerId: string;
  ephemeralKey: string;
  paymentIntentClientSecret: string;
};

// ─── GHL ──────────────────────────────────────────────────────────────────────

export type GHLOAuthStartResponse = {
  authUrl: string;
};

export type GHLConnectRequest = {
  code: string;
  locationId: string;
};

export type GHLConnectResponse = {
  locationId: string;
  locationName: string;
  connectedAt: string;
};

export type GHLContact = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  dateAdded?: string;
};

export type GHLContactsResponse = {
  contacts: GHLContact[];
  total: number;
};

// ─── OpenAI ───────────────────────────────────────────────────────────────────

export type SaveOpenAIKeyRequest = {
  apiKey: string;
};

export type SaveOpenAIKeyResponse = {
  valid: boolean;
  savedAt: string;
};
