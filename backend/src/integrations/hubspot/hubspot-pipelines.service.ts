import { BadRequestException, Injectable } from '@nestjs/common';

import { HubspotApiClient } from './hubspot-api.client';

export type HubspotPipelineStage = {
  id: string;
  label: string;
  displayOrder?: number;
  metadata?: { isClosed?: string | boolean; probability?: string | number };
};

export type HubspotPipeline = {
  id: string;
  label: string;
  displayOrder?: number;
  stages: HubspotPipelineStage[];
};

type HubspotPipelinesResponse = {
  results?: {
    id: string;
    label?: string;
    displayOrder?: number;
    stages?: {
      id: string;
      label?: string;
      displayOrder?: number;
      metadata?: { isClosed?: string | boolean; probability?: string | number };
    }[];
  }[];
};

@Injectable()
export class HubspotPipelinesService {
  constructor(private readonly api: HubspotApiClient) {}

  async list(userId: string, objectType: string): Promise<HubspotPipeline[]> {
    const data = await this.api.request<HubspotPipelinesResponse>(
      userId,
      'GET',
      `/crm/v3/pipelines/${encodeURIComponent(objectType)}`,
    );
    return (data.results ?? [])
      .map((pipeline) => ({
        id: pipeline.id,
        label: pipeline.label?.trim() || pipeline.id,
        displayOrder: pipeline.displayOrder,
        stages: (pipeline.stages ?? []).map((stage) => ({
          id: stage.id,
          label: stage.label?.trim() || stage.id,
          displayOrder: stage.displayOrder,
          metadata: stage.metadata,
        })),
      }))
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }

  async resolve(
    userId: string,
    objectType: string,
    pipelineSelector?: string,
    stageSelector?: string,
  ): Promise<{ pipeline: HubspotPipeline; stage: HubspotPipelineStage }> {
    const pipelines = await this.list(userId, objectType);
    if (pipelines.length === 0) {
      throw new BadRequestException(`No ${objectType} pipelines are available in HubSpot.`);
    }
    const pipeline = pipelineSelector
      ? findUnique(pipelines, pipelineSelector, 'pipeline')
      : stageSelector
        ? pipelines.find((candidate) =>
            candidate.stages.some((stage) => matches(stage, stageSelector)),
          )
        : pipelines[0];
    if (!pipeline) {
      throw new BadRequestException(`HubSpot pipeline "${pipelineSelector}" was not found.`);
    }
    const stage = stageSelector
      ? findUnique(pipeline.stages, stageSelector, 'stage')
      : pipeline.stages[0];
    if (!stage) {
      throw new BadRequestException(`No stage is available in the "${pipeline.label}" pipeline.`);
    }
    return { pipeline, stage };
  }

  findLabels(
    pipelines: HubspotPipeline[],
    pipelineId?: string,
    stageId?: string,
  ): { pipelineLabel?: string; stageLabel?: string } {
    const pipeline = pipelines.find((candidate) => candidate.id === pipelineId);
    const stage = pipeline?.stages.find((candidate) => candidate.id === stageId);
    return { pipelineLabel: pipeline?.label, stageLabel: stage?.label };
  }
}

function matches(value: { id: string; label: string }, selector: string): boolean {
  const needle = selector.trim().toLowerCase();
  return value.id.toLowerCase() === needle || value.label.toLowerCase() === needle;
}

function findUnique<T extends { id: string; label: string }>(
  values: T[],
  selector: string,
  label: string,
): T {
  const needle = selector.trim().toLowerCase();
  const exact = values.filter(
    (value) => value.id.toLowerCase() === needle || value.label.toLowerCase() === needle,
  );
  const matches = exact.length
    ? exact
    : values.filter((value) => value.label.toLowerCase().includes(needle));
  if (matches.length === 0) {
    throw new BadRequestException(`HubSpot ${label} "${selector}" was not found.`);
  }
  if (matches.length > 1) {
    throw new BadRequestException(
      `HubSpot ${label} "${selector}" is ambiguous; use its internal id.`,
    );
  }
  return matches[0];
}
