import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateHubspotCompanyDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(200) domain?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) additionalDomains?: string[];
  @IsOptional() @IsString() @MaxLength(64) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) industry?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(120) state?: string;
  @IsOptional() @IsString() @MaxLength(120) country?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  numberOfEmployees?: number | null;

  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(500) website?: string;
  @IsOptional() @IsString() @MaxLength(128) lifecycleStage?: string;
  @IsOptional() @IsString() @MaxLength(64) ownerId?: string;
  @IsOptional() @IsString() @MaxLength(128) pinnedEngagementId?: string;
}
