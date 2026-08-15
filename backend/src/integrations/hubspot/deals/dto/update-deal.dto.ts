import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateHubspotDealDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  name?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== '')
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  pipeline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  stage?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== '')
  @IsISO8601()
  closeDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ownerId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  collaboratorOwnerIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(65536)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  dealType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  pinnedEngagementId?: string;
}
