// Shared HubSpot DTO shapes + paginated wrapper. Resource services map raw
// HubSpot CRM objects (which are property bags) into these stable shapes so
// the mobile app never has to know about HubSpot property names directly.

export type HubspotPaginated<T> = {
  results: T[];
  /**
   * Cursor for the next page. Pass back to the same endpoint as `?after=...`
   * to fetch the next batch. `null` means there is no more data.
   */
  after: string | null;
};

export type HubspotContactSummary = {
  id: string;
  firstName?: string;
  lastName?: string;
  /** Display name, falling back to email or "Unnamed contact" if both are missing. */
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
  /** Pipeline id (HubSpot uses ids like `default`). */
  pipeline?: string;
  /** Pipeline stage id (HubSpot uses ids like `appointmentscheduled`). */
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
  phone?: string;
  industry?: string;
  city?: string;
  state?: string;
  country?: string;
  /** HubSpot stores this as `numberofemployees` (all lowercase). */
  numberOfEmployees?: number;
  description?: string;
  website?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type HubspotTicketSummary = {
  id: string;
  /** Ticket title. HubSpot stores this as `subject`. */
  subject: string;
  /** Ticket body / description. HubSpot stores this as `content`. */
  content?: string;
  /** LOW / MEDIUM / HIGH / URGENT — HubSpot's `hs_ticket_priority`. */
  priority?: string;
  /** Pipeline id (HubSpot uses ids like `0` for the default support pipeline). */
  pipeline?: string;
  /** Pipeline stage id (HubSpot uses ids like `1` for "New"). */
  stage?: string;
  ownerId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type HubspotProductSummary = {
  id: string;
  /** Product name. HubSpot stores this as `name`. */
  name: string;
  /** Unit price. HubSpot stores `price` as a string; we expose a number. */
  price?: number | null;
  /** Stock-keeping unit — HubSpot's `hs_sku`. */
  sku?: string;
  description?: string;
  /** Cost of goods sold — HubSpot's `hs_cost_of_goods_sold`. */
  cost?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

export type HubspotOrderSummary = {
  id: string;
  /** Order name. HubSpot stores this as `hs_order_name`. */
  name: string;
  /** Order total. HubSpot stores `hs_total_price` as a string; we expose a number. */
  totalPrice?: number | null;
  /** ISO currency code — HubSpot's `hs_currency_code`. */
  currency?: string;
  /** Fulfillment / shipping status — HubSpot's `hs_fulfillment_status`. */
  status?: string;
  /** Pipeline id — HubSpot's `hs_pipeline`. */
  pipeline?: string;
  /** Pipeline stage id — HubSpot's `hs_pipeline_stage`. */
  stage?: string;
  ownerId?: string;
  /** Source store — HubSpot's `hs_source_store`. */
  sourceStore?: string;
  createdAt?: string;
  updatedAt?: string;
};

/** Raw HubSpot CRM object as returned by /crm/v3/objects/{type}. */
export type HubspotRawObject = {
  id: string;
  properties: Record<string, string | null | undefined>;
  createdAt?: string;
  updatedAt?: string;
};

export type HubspotPagedResponse = {
  results: HubspotRawObject[];
  paging?: {
    next?: { after?: string };
  };
};

export type HubspotSearchResponse = {
  total?: number;
  results: HubspotRawObject[];
  paging?: {
    next?: { after?: string };
  };
};
