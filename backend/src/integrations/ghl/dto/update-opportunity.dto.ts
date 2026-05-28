import { IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

import type { GhlOpportunityStatus } from './create-opportunity.dto';

export class UpdateGhlOpportunityDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  pipelineId?: string;

  @IsOptional()
  @IsString()
  pipelineStageId?: string;

  @IsOptional()
  @IsEnum(['open', 'won', 'lost', 'abandoned'])
  status?: GhlOpportunityStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monetaryValue?: number;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  @IsString()
  source?: string;
}
