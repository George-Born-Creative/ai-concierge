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

export type GhlOpportunitiesListResult = {
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
