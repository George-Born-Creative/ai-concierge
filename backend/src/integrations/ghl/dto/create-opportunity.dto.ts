import { IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export type GhlOpportunityStatus = 'open' | 'won' | 'lost' | 'abandoned';

export class CreateGhlOpportunityDto {
  @IsString()
  @MinLength(1)
  pipelineId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

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
  contactId?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  @IsString()
  source?: string;
}
