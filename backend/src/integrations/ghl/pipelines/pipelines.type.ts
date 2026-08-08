export type GhlPipelineStageSummary = {
  id: string;
  name: string;
  position?: number;
};

export type GhlPipelineSummary = {
  id: string;
  name: string;
  stages: GhlPipelineStageSummary[];
};

export type GhlPipelinesListResult = {
  pipelines: GhlPipelineSummary[];
};
