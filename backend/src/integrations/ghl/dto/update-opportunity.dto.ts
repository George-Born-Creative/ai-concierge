import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { GhlOpportunityCustomFieldDto } from './opportunity-v3.dto';

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

  @IsOptional() @IsString() forecastExpectedCloseDate?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) forecastProbability?: number;
  @IsOptional() @IsString() externalObjectId?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => GhlOpportunityCustomFieldDto)
  customFields?: GhlOpportunityCustomFieldDto[];
}
