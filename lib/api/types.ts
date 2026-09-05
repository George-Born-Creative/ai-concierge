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

export type CodeDeliveryResponse = {
  ok: true;
  // Optional so the current backend response remains compatible while allowing
  // a future Twilio rate-limit/cooldown value to drive the UI.
  retryAfterSeconds?: number;
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

export type CrmEntitlements = {
  ghl: boolean;
  hubspot: boolean;
};

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
  // ISO timestamp of the current billing period end. Null when the
  // processor hasn't reported a renewal/expiry date yet.
  expiresAt?: string | null;
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
  plans?: UserPlan[];
  // Every CRM subscription on the account (GHL and HubSpot can both be paid).
  // Same rows as `plans`. Prefer this when listing cards.
  subscriptions?: UserPlan[];
  entitlements?: CrmEntitlements;
  integrations?: CrmEntitlements;
  // Currently selected CRM (User.activeCrmProvider). Distinct from whether
  // that CRM is connected or paid.
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

export type GhlContactCustomField = {
  id?: string;
  key?: string;
  field_value: string | number | boolean | string[] | null;
};

export type GhlContactSummary = {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  companyName?: string;
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  source?: string;
  assignedTo?: string;
  tags?: string[];
  dateAdded?: string;
  dateUpdated?: string;
};

export type GhlContactsListResponse = {
  contacts: GhlContactSummary[];
  meta?: {
    total?: number;
    currentPage?: number;
    nextPage?: number | null;
    pageLimit?: number;
    startAfterId?: string | null;
    nextPageUrl?: string | null;
  };
};

export type CreateGhlContactRequest = {
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  website?: string;
  timezone?: string;
  source?: string;
  assignedTo?: string;
  tags?: string[];
  customFields?: GhlContactCustomField[];
};

export type UpdateGhlContactRequest = {
  [K in keyof CreateGhlContactRequest]?: CreateGhlContactRequest[K] | null;
};

export type SearchGhlContactsRequest = {
  limit?: number;
  page?: number;
  query?: string;
  filters?: Record<string, unknown>[];
  sort?: { field: string; direction: 'asc' | 'desc' }[];
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
  lastStatusChangeAt?: string;
  lastStageChangeAt?: string;
  lastActionDate?: string;
  forecastExpectedCloseDate?: string;
  forecastOriginalCloseDate?: string;
  forecastSlippageCount?: number;
  forecastDaysSlipped?: number;
  forecastLastSlippedAt?: string;
  forecastProbability?: number;
  effectiveProbability?: number;
  lostReasonId?: string;
  followers?: string[];
  customFields?: { id?: string; key?: string; fieldValue?: unknown }[];
  externalObjectId?: string;
};

export type GhlOpportunitiesListResponse = {
  opportunities: GhlOpportunitySummary[];
  meta?: {
    total?: number;
    nextPageUrl?: string | null;
    page?: number;
    limit?: number;
    startAfter?: number | string;
    startAfterId?: string | null;
  };
};

export type ListGhlOpportunitiesParams = {
  limit?: number;
  query?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  contactId?: string;
  assignedTo?: string;
  order?: 'added_asc' | 'added_desc' | 'updated_asc' | 'updated_desc';
  page?: number;
  status?: 'open' | 'won' | 'lost' | 'abandoned' | 'all';
};

export type SearchGhlOpportunitiesRequest = ListGhlOpportunitiesParams & {
  filters?: Record<string, unknown>[];
  sort?: { field: string; direction: 'asc' | 'desc' }[];
  startAfter?: number;
  startAfterId?: string;
};

export type GhlCalendarSummary = {
  id: string;
  name: string;
  isActive?: boolean;
  description?: string;
  calendarType?: string;
  eventType?: string;
  groupId?: string;
  slug?: string;
  widgetSlug?: string;
  widgetType?: string;
  timezone?: string;
  eventTitle?: string;
  eventColor?: string;
  slotDuration?: number;
  slotDurationUnit?: string;
  slotInterval?: number;
  slotIntervalUnit?: string;
  slotBuffer?: number;
  slotBufferUnit?: string;
  preBuffer?: number;
  preBufferUnit?: string;
  appointmentsPerSlot?: number;
  appointmentsPerDay?: number;
  allowBookingAfter?: number;
  allowBookingAfterUnit?: string;
  allowBookingFor?: number;
  allowBookingForUnit?: string;
  allowReschedule?: boolean;
  allowCancellation?: boolean;
  autoConfirm?: boolean;
  enableRecurring?: boolean;
  meetingLocation?: string;
  teamSummary?: string;
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

export type GhlConversationSummary = {
  id: string;
  contactId: string;
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  channel?: string;
  lastMessageBody?: string;
  lastMessageDirection?: 'inbound' | 'outbound';
  lastMessageAt?: string;
  unreadCount: number;
  starred?: boolean;
  // New fields for inbox organization
  assignedTo?: string;
  followers?: string[];
  inbox?: string;
  lastMessageType?: string;
};

/** Request payload for updating a conversation (star/unstar, mark as read) */
export type UpdateGhlConversationRequest = {
  starred?: boolean;
  unreadCount?: number;
};

export type GhlMessageSummary = {
  id: string;
  conversationId: string;
  contactId?: string;
  direction: 'inbound' | 'outbound';
  type: string;
  body?: string;
  subject?: string;
  status?: string;
  attachments: string[];
  createdAt?: string;
};

export type GhlConversationsListResponse = {
  conversations: GhlConversationSummary[];
  meta?: {
    total?: number;
  };
};

export type GhlConversationMessagesListResponse = {
  messages: GhlMessageSummary[];
  meta?: {
    total?: number;
    nextPageUrl?: string | null;
    startAfterId?: string | null;
  };
};

export type ListGhlConversationsParams = {
  limit?: number;
  query?: string;
  // New filter fields:
  status?: 'all' | 'read' | 'unread' | 'starred'; // GHL status filter
  assignedTo?: string; // GHL user ID or "unassigned"
  followers?: string; // comma‑separated GHL user IDs
  lastMessageType?: string; // e.g. "TYPE_INTERNAL_COMMENT"
  sortBy?: 'last_message_date' | 'last_manual_message_date' | 'score_profile';
  sort?: 'asc' | 'desc';
};

export type ListGhlConversationMessagesParams = {
  limit?: number;
  lastMessageId?: string;
};

export type SendGhlMessageRequest = {
  type: 'SMS' | 'Email' | 'InternalComment' | 'WhatsApp' | 'Live_Chat' | 'FB' | 'IG' | 'Custom';
  contactId?: string;
  conversationId?: string;
  message: string;
  subject?: string;
  html?: string;
  attachments?: string[];
};

export type SendGhlMessageResponse = {
  conversationId?: string;
  messageId?: string;
  msgId?: string;
  success?: boolean;
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

// ─── HubSpot CRM resources ───────────────────────────────────────────────────

/**
 * HubSpot pagination wrapper. `after` is an opaque cursor returned by the
 * backend (mirrors HubSpot's `paging.next.after`); pass it back as `?after=`
 * on the next request, or `null` when there's no more data.
 */
export type HubspotPaginated<T> = {
  results: T[];
  after: string | null;
  total?: number;
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
  currency?: string;
  pipeline?: string;
  pipelineLabel?: string;
  stage?: string;
  stageLabel?: string;
  closeDate?: string;
  ownerId?: string;
  description?: string;
  dealType?: string;
  pinnedEngagementId?: string;
  createdAt?: string;
  updatedAt?: string;
};

/**
 * Contact properties accepted by HubSpot create/update endpoints. Empty
 * strings are useful on update because HubSpot treats them as field clears.
 */
export type HubspotContactWriteInput = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  lifecycleStage?: string;
};

export type HubspotPipeline = {
  id: string;
  label: string;
  displayOrder?: number;
  stages: { id: string; label: string; displayOrder?: number }[];
};

export type HubspotDealWriteInput = {
  name?: string;
  amount?: number | null;
  currency?: string;
  pipeline?: string;
  stage?: string;
  closeDate?: string;
  ownerId?: string;
  collaboratorOwnerIds?: string[];
  description?: string;
  dealType?: string;
  pinnedEngagementId?: string;
};

export type HubspotDealCreateAssociation = {
  to: { id: string };
  types: {
    associationCategory: 'HUBSPOT_DEFINED' | 'USER_DEFINED' | 'INTEGRATOR_DEFINED';
    associationTypeId: number;
  }[];
};

export type HubspotDealCreateInput = HubspotDealWriteInput & {
  name: string;
  associations?: HubspotDealCreateAssociation[];
};

export type HubspotDealDetail = HubspotDealSummary & {
  properties: Record<string, string | null | undefined>;
  propertiesWithHistory?: Record<string, unknown>;
  associations?: Record<string, unknown>;
};

export type HubspotDealBatchResponse = {
  status?: string;
  results: HubspotDealSummary[];
  errors?: unknown[];
};

export type HubspotCompanySummary = {
  id: string;
  name: string;
  domain?: string;
  additionalDomains?: string[];
  phone?: string;
  industry?: string;
  city?: string;
  state?: string;
  country?: string;
  numberOfEmployees?: number;
  description?: string;
  website?: string;
  lifecycleStage?: string;
  ownerId?: string;
  pinnedEngagementId?: string;
  lastActivityAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type HubspotCompanyAssociation = HubspotDealCreateAssociation;

export type HubspotCompanyWriteInput = {
  name?: string;
  domain?: string;
  additionalDomains?: string[];
  phone?: string;
  industry?: string;
  city?: string;
  state?: string;
  country?: string;
  numberOfEmployees?: number | null;
  description?: string;
  website?: string;
  lifecycleStage?: string;
  ownerId?: string;
  pinnedEngagementId?: string;
  associations?: HubspotCompanyAssociation[];
};

export type HubspotCompanyDetail = HubspotCompanySummary & {
  properties: Record<string, string | null | undefined>;
  propertiesWithHistory?: Record<string, unknown>;
  associations?: Record<string, unknown>;
};

export type HubspotCompanyBatchResponse = {
  status?: string;
  results: HubspotCompanySummary[];
  errors?: unknown[];
};

export type HubspotTicketSummary = {
  id: string;
  subject: string;
  content?: string;
  priority?: string;
  pipeline?: string;
  pipelineLabel?: string;
  stage?: string;
  stageLabel?: string;
  ownerId?: string;
  pinnedEngagementId?: string;
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
  recurringBillingPeriod?: string;
  pricingModel?: 'volume' | 'graduated' | 'stairstep';
  tierRanges?: HubspotProductTierRange[];
  tierPrices?: HubspotProductTierPrice[];
  archived?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type HubspotProductTierRange = { start: number; end?: number };
export type HubspotProductTierPrice = { index: number; price: number; currency?: string };

export type HubspotProductWriteInput = {
  name?: string;
  price?: number;
  sku?: string;
  description?: string;
  cost?: number;
  recurringBillingPeriod?: string;
  pricingModel?: 'volume' | 'graduated' | 'stairstep';
  tierRanges?: HubspotProductTierRange[];
  tierPrices?: HubspotProductTierPrice[];
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

export type SearchHubspotCompaniesParams = ListHubspotParams & {
  q: string;
};

export type HubspotTicketWriteInput = {
  subject?: string;
  content?: string | null;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | null;
  pipeline?: string;
  stage?: string;
  ownerId?: string | null;
  pinnedEngagementId?: string | null;
  properties?: Record<string, string | null>;
};

export type HubspotTicketCreateInput = HubspotTicketWriteInput & {
  subject: string;
  associations?: {
    toId: string;
    types: {
      associationCategory: 'HUBSPOT_DEFINED' | 'USER_DEFINED' | 'INTEGRATOR_DEFINED';
      associationTypeId: number;
    }[];
  }[];
};

export type HubspotTicketDetail = HubspotTicketSummary & {
  properties: Record<string, string | null | undefined>;
  propertiesWithHistory?: Record<string, unknown>;
  associations?: Record<string, unknown>;
};

export type HubspotTicketBatchResponse = {
  status?: string;
  results: HubspotTicketSummary[];
  errors?: unknown[];
};

export type SearchHubspotDealsParams = ListHubspotParams & {
  q: string;
};

export type SearchHubspotTicketsParams = ListHubspotParams & {
  q?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  pipeline?: string;
  stage?: string;
  ownerId?: string;
  sort?: 'updated_desc' | 'updated_asc' | 'created_desc' | 'created_asc';
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
 * Speech-to-text and grammar correction happen here. Intent normalization
 * still happens once in /assistant/.../commands with full conversation
 * history and session context.
 */
export type TranscribeResponse = {
  transcript: string;
  rawTranscript?: string;
  correctedTranscript?: string;
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
  rawTranscript?: string;
  correctedTranscript?: string;
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
  rawTranscript?: string;
  correctedTranscript?: string;
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

// â”€â”€â”€ Help & support â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type SupportRequestCategory =
  | 'ACCOUNT'
  | 'BILLING'
  | 'CRM_GHL'
  | 'CRM_HUBSPOT'
  | 'OPENAI_ASSISTANT'
  | 'VOICE'
  | 'REMINDERS_NOTIFICATIONS'
  | 'CONNECTIVITY'
  | 'PRIVACY_SECURITY'
  | 'FEEDBACK'
  | 'OTHER';

export type SupportDeliveryStatus = 'PENDING' | 'SENT' | 'FAILED';

export type SupportDiagnosticStatus = 'ok' | 'warning' | 'error' | 'info';

export type SupportDiagnosticItem = {
  key: string;
  label: string;
  status: SupportDiagnosticStatus;
  value: string;
  detail?: string;
};

export type SupportDiagnosticGroup = {
  key: string;
  label: string;
  items: SupportDiagnosticItem[];
};

export type SupportDiagnosticsResponse = {
  generatedAt: string;
  groups: SupportDiagnosticGroup[];
};

export type ClientSupportDiagnostics = {
  capturedAt: string;
  appVersion: string;
  buildVersion: string | null;
  platform: 'ios' | 'android' | 'web' | 'windows' | 'macos';
  osVersion: string;
  executionEnvironment: string;
  timezone: string;
  locale: string;
  networkType: string;
  networkReachable: boolean | null;
  pushStatus:
    | 'granted'
    | 'denied'
    | 'not_a_device'
    | 'no_project_id'
    | 'error'
    | 'web'
    | 'expo_go'
    | 'unknown';
  apiHost: string;
  apiReachable: boolean;
};

export type CreateSupportRequest = {
  clientRequestId: string;
  category: SupportRequestCategory;
  subject: string;
  description: string;
  includeDiagnostics?: boolean;
  clientDiagnostics?: ClientSupportDiagnostics;
};

export type CreateSupportRequestResponse = {
  caseReference: string;
  email: string;
  deliveryStatus: SupportDeliveryStatus;
  createdAt: string;
};
