import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength, ValidateNested } from 'class-validator';

export class GhlPipelineStageDto {
  @IsOptional() @IsString() id?: string;
  @IsString() @MinLength(1) name!: string;
  @Type(() => Number) @IsInt() @Min(0) position!: number;
  @IsOptional() @IsBoolean() showInFunnel?: boolean;
  @IsOptional() @IsBoolean() showInPieChart?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) stageWinProbability?: number;
}

export class CreateGhlPipelineDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsBoolean() useOpportunityProbability?: boolean;
  @IsArray() @ValidateNested({ each: true }) @Type(() => GhlPipelineStageDto)
  stages!: GhlPipelineStageDto[];
}

export class UpdateGhlPipelineDto extends CreateGhlPipelineDto {}

export class DeleteGhlPipelineQueryDto {
  @Type(() => Boolean) @IsBoolean() confirm!: boolean;
}
