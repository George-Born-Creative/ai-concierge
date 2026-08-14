import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  Allow,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class GhlOpportunityCustomFieldDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() key?: string;
  @Allow()
  fieldValue!: unknown;
}

export class AdvancedOpportunitySearchDto {
  @IsOptional() @IsArray() filters?: Record<string, unknown>[];
  @IsOptional() @IsArray() sort?: { field: string; direction: 'asc' | 'desc' }[];
  @IsOptional() @IsString() query?: string;
  @IsOptional() @IsString() pipelineId?: string;
  @IsOptional() @IsString() pipelineStageId?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() assignedTo?: string;
  @IsOptional() @IsIn(['open', 'won', 'lost', 'abandoned', 'all']) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @IsString() startAfterId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() startAfter?: number;
}

export class OpportunityFollowersDto {
  @IsArray() @IsString({ each: true }) followers!: string[];
}

export class RemoveOpportunityFollowersDto {
  @IsOptional() @IsArray() @IsString({ each: true }) followers?: string[];
  @IsOptional() @IsBoolean() removeAll?: boolean;
}

export class UpsertGhlOpportunityDto {
  @IsString() @MinLength(1) pipelineId!: string;
  @IsString() @MinLength(1) name!: string;
  @IsString() @MinLength(1) contactId!: string;
  @IsOptional() @IsString() pipelineStageId?: string;
  @IsOptional() @IsIn(['open', 'won', 'lost', 'abandoned']) status?: string;
  @IsOptional() @IsNumber() @Min(0) monetaryValue?: number;
  @IsOptional() @IsString() forecastExpectedCloseDate?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) forecastProbability?: number;
  @IsOptional() @IsString() assignedTo?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() externalObjectId?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => GhlOpportunityCustomFieldDto)
  customFields?: GhlOpportunityCustomFieldDto[];
}
