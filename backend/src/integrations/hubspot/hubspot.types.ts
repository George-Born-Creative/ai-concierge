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
  industry?: string;
  city?: string;
  country?: string;
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
