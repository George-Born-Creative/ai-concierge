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
  provider?: CrmProvider;
  hasIntegration?: boolean;
  hasOpenAIKey?: boolean;
  openAIKeyLast4?: string;
};

// ─── CRM provider ────────────────────────────────────────────────────────────

export type CrmProvider = 'ghl' | 'hubspot';

// ─── Plan ─────────────────────────────────────────────────────────────────────

export type PlanId = 'ghl-pro' | 'hubspot-pro';

export type Plan = {
  id: PlanId;
  name: string;
  provider: CrmProvider;
  price: number;
  currency: string;
  features: string[];
};

export type SelectPlanRequest = {
  planId: PlanId;
};

export type SelectPlanResponse = {
  planId: PlanId;
  provider: CrmProvider;
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

// ─── Integration OAuth ────────────────────────────────────────────────────────

export type OAuthStartResponse = {
  authUrl: string;
};

export type IntegrationStatus = {
  connected: boolean;
  provider: CrmProvider;
  connectedAt?: string;
  scopes?: string[];
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

export type HubSpotConnectRequest = {
  code: string;
};

export type HubSpotConnectResponse = {
  portalId: string;
  portalName: string;
  connectedAt: string;
};

// ─── Unified CRM actions (backend resolves provider) ──────────────────────────

export type NormalizedLead = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  intent?: string;
  notes?: string;
  budget?: string;
  timeline?: string;
  nextAction?: string;
};

export type Contact = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  createdAt?: string;
};

export type ContactsResponse = {
  contacts: Contact[];
  total: number;
};

export type DealInput = {
  contactId?: string;
  name: string;
  amount?: number;
  stage?: string;
};

export type TaskInput = {
  contactId?: string;
  title: string;
  dueAt?: string;
  notes?: string;
};

export type OpportunityPatch = {
  stage?: string;
  amount?: number;
  notes?: string;
};

// ─── OpenAI ───────────────────────────────────────────────────────────────────

export type SaveOpenAIKeyRequest = {
  apiKey: string;
};

export type SaveOpenAIKeyResponse = {
  valid: boolean;
  savedAt: string;
  last4: string;
};

export type OpenAIKeyStatus = {
  hasKey: boolean;
  last4?: string;
  savedAt?: string;
};
