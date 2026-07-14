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

// Google native sign-in: the app sends the Google ID token, the backend
// verifies it and returns an app session (AuthResponse).
export type GoogleAuthRequest = {
  idToken: string;
};

// Forgot-password step 1: request a 6-digit reset code by email.
export type RequestPasswordResetRequest = {
  email: string;
};

// Forgot-password step 2: submit the emailed code + a new password.
export type ResetPasswordRequest = {
  email: string;
  code: string;
  newPassword: string;
};

export type AuthResponse = {
  token: string;
  user: User;
};

export type CrmProvider = 'ghl' | 'hubspot';

// Which payment processor owns the user's active subscription.
// 'stripe' covers both the in-app PaymentSheet (Android) and the iOS
// Stripe-via-web Checkout link-out. 'apple' covers iOS in-app subscriptions
// purchased through StoreKit / Apple IAP.
export type PaymentProvider = 'stripe' | 'apple';

export type UserPlan = {
  id: string;
  name: string;
  provider: CrmProvider;
  // 'incomplete' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'
  status: string;
  paymentProvider: PaymentProvider;
  // Apple App Store Connect product identifier (e.g.
  // 'com.daveget.aiconcierge.ghl_pro_monthly'); null when the plan isn't
  // sold via Apple IAP.
  appleProductId: string | null;
};

export type User = {
  id: string;
  name: string;
  email: string;
  // False until the user confirms the code emailed at signup. Google sign-ins
  // are created already verified. The auth gate routes unverified users to
  // /verify-email. Optional so older cached sessions default to "not gated".
  emailVerified?: boolean;
  // IANA timezone (e.g. "America/Los_Angeles"). Set by the mobile client on
  // signin via Intl.DateTimeFormat().resolvedOptions().timeZone, used by the
  // backend for reminder time parsing.
  timezone?: string | null;
  // True iff the backend has a non-null `expoPushToken` for this user.
  hasPushToken?: boolean;
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

// Sent to POST /billing/apple/verify and POST /billing/apple/restore.
// `jwsRepresentation` is the StoreKit 2 JWS — surfaced as
// `purchaseToken` on the iOS Purchase object emitted by expo-iap's
// purchaseUpdatedListener (and on the active purchase returned by
// getAvailablePurchases() during a restore flow).
export type VerifyAppleReceiptRequest = {
  planCode: PlanCode;
  jwsRepresentation: string;
};

// Mirrors AppleVerifyResult on the backend. `paymentProvider` is always
// 'apple' here — the field is present so callers can refresh-and-branch the
// UI without a second profile fetch.
export type VerifyAppleReceiptResponse = {
  paymentProvider: 'apple';
  // SubscriptionStatus enum value, upper-cased (e.g. 'ACTIVE', 'CANCELED').
  status: string;
  planCode: PlanCode;
  expiresAt: string | null;
};

// Shape returned by GET /plans. Both prices arrive in cents (so the mobile
// app can compute discount math without parsing display strings) plus a
// pre-formatted display string for direct rendering.
export type PlanListItem = {
  id: PlanCode;
  name: string;
  provider: CrmProvider;
  monthlyPrice: number;
  monthlyPriceDisplay: string;
  applePrice: number | null;
  applePriceDisplay: string | null;
  appleProductId: string | null;
  // Legacy field kept for any callers still reading `price`. Equals
  // `monthlyPriceDisplay`. Prefer the explicit fields for new code.
  price: string;
  currency: string;
  features: string[];
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

export type GhlOpportunitySummary = {
  id: string;
  name: string;
  monetaryValue?: number;
  status: string;
  pipelineId: string;
  pipelineStageId?: string;
  pipelineStageName?: string;
  contactId?: string;
  contactName?: string;
  assignedTo?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type GhlOpportunitiesListResponse = {
  opportunities: GhlOpportunitySummary[];
  meta?: {
    total?: number;
    nextPageUrl?: string | null;
  };
};

export type ListGhlOpportunitiesParams = {
  limit?: number;
  query?: string;
  pipelineId?: string;
  status?: 'open' | 'won' | 'lost' | 'abandoned' | 'all';
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
  contactName?: string;
  calendarId?: string;
  calendarName?: string;
  ownerId?: string;
  ownerName?: string;
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

export type CreateGhlCalendarRequest = {
  name: string;
  description?: string;
  isActive?: boolean;
  options?: Record<string, unknown>;
};

export type UpdateGhlCalendarRequest = {
  name?: string;
  description?: string;
  isActive?: boolean;
  options?: Record<string, unknown>;
};

export type GhlCalendarFreeSlotsParams = {
  startDate: number;
  endDate: number;
  timezone?: string;
  userId?: string;
};

export type GhlCalendarFreeSlotsResponse = Record<string, unknown>;

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

// ─── HubSpot CRM resources ───────────────────────────────────────────────────

/**
 * HubSpot pagination wrapper. `after` is an opaque cursor returned by the
 * backend (mirrors HubSpot's `paging.next.after`); pass it back as `?after=`
 * on the next request, or `null` when there's no more data.
 */
export type HubspotPaginated<T> = {
  results: T[];
  after: string | null;
};

export type HubspotContactSummary = {
  id: string;
  firstName?: string;
  lastName?: string;
  /** Display name with email/Unnamed contact fallbacks resolved server-side. */
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  lifecycleStage?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type HubspotDealSummary = {
  id: string;
  name: string;
  amount?: number | null;
  pipeline?: string;
  stage?: string;
  closeDate?: string;
  ownerId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type HubspotCompanySummary = {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  city?: string;
  country?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type HubspotTicketSummary = {
  id: string;
  subject: string;
  content?: string;
  priority?: string;
  pipeline?: string;
  stage?: string;
  ownerId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type HubspotProductSummary = {
  id: string;
  name: string;
  price?: number | null;
  sku?: string;
  description?: string;
  cost?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

export type HubspotOrderSummary = {
  id: string;
  name: string;
  totalPrice?: number | null;
  currency?: string;
  status?: string;
  pipeline?: string;
  stage?: string;
  ownerId?: string;
  sourceStore?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ListHubspotParams = {
  limit?: number;
  after?: string;
};

export type SearchHubspotContactsParams = ListHubspotParams & {
  q: string;
};

export type SearchHubspotTicketsParams = ListHubspotParams & {
  q: string;
};

export type SearchHubspotProductsParams = ListHubspotParams & {
  q: string;
};

export type SearchHubspotOrdersParams = ListHubspotParams & {
  q: string;
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

/**
 * Response from POST /voice/transcribe.
 *
 * The backend used to also run the gpt-4o-mini intent normalizer here,
 * doubling perceived voice latency. Normalization now happens once in
 * /assistant/.../commands with full conversation history + session
 * context, so this endpoint just returns the transcript.
 */
export type TranscribeResponse = {
  transcript: string;
};

// ─── Assistant conversations ─────────────────────────────────────────────────

export type AssistantConversationSummary = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string | null;
  status: 'success' | 'error' | 'pending';
  source: 'text' | 'voice' | null;
};

export type AssistantConversationBucketKey =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'older';

export type AssistantConversationGroup = {
  key: AssistantConversationBucketKey;
  label: string;
  conversations: AssistantConversationSummary[];
};

export type AssistantConversationGroupsResponse = {
  groups: AssistantConversationGroup[];
};

export type AssistantMessage = {
  id: string;
  command: string;
  response: string;
  status: 'success' | 'error';
  source: 'text' | 'voice';
  transcript?: string;
  intent?: VoiceIntent;
  voiceUri?: string;
  pending?: boolean;
  createdAt: string;
};

export type AssistantConversation = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages: AssistantMessage[];
};

export type RunAssistantCommandRequest = {
  text: string;
  source?: 'text' | 'voice';
  transcript?: string;
  voiceUri?: string;
  intent?: VoiceIntent;
};

/**
 * SSE event types streamed by `POST /assistant/conversations/:id/commands/stream`.
 *
 * - `phase`: lifecycle marker — surface to the user as a live status line
 *   ("Understanding your request…" → "Working on your CRM…" → "Writing a
 *   reply…"). Keep in sync with the backend `AssistantPhase`.
 * - `token`: a content delta that should be appended to the in-flight
 *   bubble's `response` so TypewriterText catches up live
 * - `done`: terminal event with the persisted server message — swap
 *   the optimistic id, finalise the bubble, stop animating
 */
export type AssistantPhase = 'normalizing' | 'working' | 'thinking';

export type AssistantStreamEvent =
  | { type: 'phase'; phase: AssistantPhase }
  | { type: 'token'; delta: string }
  | { type: 'done'; message: AssistantMessage };

// ─── Reminders ───────────────────────────────────────────────────────────────

export type ReminderStatus =
  | 'SCHEDULED'
  | 'SNOOZED'
  | 'DELIVERED'
  | 'DISMISSED'
  | 'FAILED'
  | 'CANCELED';

export type ReminderLinkType = 'CONTACT' | 'COMPANY' | 'DEAL' | 'APPOINTMENT';
export type ReminderSource = 'text' | 'voice';
export type ReminderListRange = 'today' | 'upcoming' | 'past';
export type SnoozePreset = '10m' | '1h' | 'tomorrow9';

export type Reminder = {
  id: string;
  title: string;
  notes: string | null;
  // The event/target time the user picked (or the appointment start).
  dueAt: string;
  // Minutes before `dueAt` to notify (0 = at the event).
  remindOffsetMinutes: number;
  // The actual time the notification fires = clamp(dueAt - offset). Local
  // notifications are scheduled against this.
  notifyAt: string;
  status: ReminderStatus;
  snoozedUntil: string | null;
  linkType: ReminderLinkType | null;
  linkProvider: CrmProvider | null;
  linkExternalId: string | null;
  linkLabel: string | null;
  source: ReminderSource;
  createdAt: string;
};

export type CreateReminderRequest = {
  title: string;
  notes?: string;
  dueAt: string;
  remindOffsetMinutes?: number;
  linkType?: ReminderLinkType;
  linkProvider?: CrmProvider;
  linkExternalId?: string;
  linkLabel?: string;
  source?: ReminderSource;
};

export type UpdateReminderRequest = Partial<
  Omit<CreateReminderRequest, 'source'>
>;

// Backend accepts either an explicit ISO timestamp OR a preset shortcut.
// The two variants are mutually exclusive — pass exactly one.
export type SnoozeReminderRequest =
  | { snoozeUntil: string; preset?: never }
  | { preset: SnoozePreset; snoozeUntil?: never };

export type SetPushTokenResponse = { ok: true; hasPushToken: boolean };
export type SetTimezoneResponse = { ok: true; timezone: string };
