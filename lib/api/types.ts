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

// ─── GoHighLevel OAuth ───────────────────────────────────────────────────────

export type GhlAuthUrlResponse = {
  url: string;
  state: string;
};

export type GhlStatusResponse = {
  connected: boolean;
  locationId?: string | null;
  expiresAt?: string | null;
  scopes?: string[];
  calendarScopesGranted?: boolean;
};

export type GhlContactSummary = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  dateAdded?: string;
};

export type GhlContactsListResponse = {
  contacts: GhlContactSummary[];
  meta?: {
    total?: number;
    startAfterId?: string | null;
  };
};

export type CreateGhlContactRequest = {
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
};

export type GhlCalendarSummary = {
  id: string;
  name: string;
  isActive?: boolean;
};

export type GhlCalendarsListResponse = {
  calendars: GhlCalendarSummary[];
};

export type GhlAppointmentSummary = {
  id: string;
  title: string;
  startTime?: string;
  endTime?: string;
  contactId?: string;
  calendarId?: string;
  status?: string;
};

export type GhlAppointmentsListResponse = {
  appointments: GhlAppointmentSummary[];
};

export type CreateGhlAppointmentRequest = {
  calendarId?: string;
  calendarName?: string;
  contactId?: string;
  contactName?: string;
  startTime: string;
  endTime?: string;
  durationMinutes?: number;
  title?: string;
  notes?: string;
  timeZone?: string;
};

export type ListGhlCalendarEventsParams = {
  calendarId?: string;
  calendarName?: string;
  startTime?: string;
  endTime?: string;
  days?: number;
};

// ─── HubSpot OAuth ───────────────────────────────────────────────────────────

export type HubspotAuthUrlResponse = {
  url: string;
  state: string;
};

export type HubspotStatusResponse = {
  connected: boolean;
  portalId?: string | null;
  expiresAt?: string | null;
  scopes?: string[];
};

// ─── OpenAI key vault ────────────────────────────────────────────────────────

export type SaveOpenAIKeyRequest = {
  key: string;
};

export type OpenAIKeyStatus = {
  exists: boolean;
  last4: string | null;
  createdAt: string | null;
  quotaWarning?: boolean;
};

// ─── Voice transcribe ────────────────────────────────────────────────────────

export type VoiceIntent = {
  intent: string;
  confidence: number;
  entities: Record<string, string | number | boolean | null>;
  needs_clarification: boolean;
  notes: string | null;
};

export type TranscribeResponse = {
  transcript: string;
  intent: VoiceIntent;
};
