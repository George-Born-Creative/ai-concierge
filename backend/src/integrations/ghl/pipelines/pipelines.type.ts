export type GhlPipelineStageSummary = {
  id: string;
  name: string;
  position?: number;
  showInFunnel?: boolean;
  showInPieChart?: boolean;
  stageWinProbability?: number;
};

export type GhlPipelineSummary = {
  id: string;
  name: string;
  stages: GhlPipelineStageSummary[];
  useOpportunityProbability?: boolean;
};

export type GhlLostReason = { id: string; name: string };

export type GhlPipelinesListResult = {
  pipelines: GhlPipelineSummary[];
};
