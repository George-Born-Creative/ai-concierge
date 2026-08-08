export type GhlOpportunityStatus = 'open' | 'won' | 'lost' | 'abandoned';
export type GhlOpportunityStatusFilter = GhlOpportunityStatus | 'all';

export type GhlOpportunitySummary = {
  id: string;
  name: string;
  monetaryValue?: number;
  status: GhlOpportunityStatus;
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

export type GhlOpportunitiesListResult = {
  opportunities: GhlOpportunitySummary[];
  meta?: {
    total?: number;
    nextPageUrl?: string | null;
  };
};
