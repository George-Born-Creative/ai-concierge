export type GhlContactSummary = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  dateAdded?: string;
};

export type GhlContactsListResult = {
  contacts: GhlContactSummary[];
  meta?: {
    total?: number;
    startAfterId?: string | null;
  };
};
