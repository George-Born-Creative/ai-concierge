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

export type GhlContactsListResult = {
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

export type GhlContactInput = {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  website?: string | null;
  timezone?: string | null;
  source?: string | null;
  assignedTo?: string | null;
  tags?: string[];
  customFields?: GhlContactCustomField[];
};

export type GhlContactSearchFilter = Record<string, unknown>;
export type GhlContactSearchSort = { field: string; direction: 'asc' | 'desc' };

export type GhlContactSearchInput = {
  limit?: number;
  page?: number;
  query?: string;
  filters?: GhlContactSearchFilter[];
  sort?: GhlContactSearchSort[];
};
