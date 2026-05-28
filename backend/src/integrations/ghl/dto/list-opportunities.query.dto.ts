import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export type GhlOpportunityStatusFilter = 'open' | 'won' | 'lost' | 'abandoned' | 'all';
export type GhlOpportunitySearchOrder = 'added_asc' | 'added_desc' | 'updated_asc' | 'updated_desc';

/**
 * Query for GHL `/opportunities/search`. Field names mirror the SDK's
 * `searchOpportunity` snippet (snake_case is mapped inside the service).
 */
export class ListGhlOpportunitiesQueryDto {
  @IsOptional()
  @IsString()
  pipelineId?: string;

  @IsOptional()
  @IsString()
  pipelineStageId?: string;

  @IsOptional()
  @IsEnum(['open', 'won', 'lost', 'abandoned', 'all'])
  status?: GhlOpportunityStatusFilter;

  /** Free-text search (mapped to GHL `q`). */
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsOptional()
  @IsEnum(['added_asc', 'added_desc', 'updated_asc', 'updated_desc'])
  order?: GhlOpportunitySearchOrder;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
