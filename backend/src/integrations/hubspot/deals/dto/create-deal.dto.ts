import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class DealAssociationTypeDto {
  @IsIn(['HUBSPOT_DEFINED', 'USER_DEFINED', 'INTEGRATOR_DEFINED'])
  associationCategory!: 'HUBSPOT_DEFINED' | 'USER_DEFINED' | 'INTEGRATOR_DEFINED';

  @IsInt()
  @Min(1)
  associationTypeId!: number;
}

class DealAssociationTargetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  id!: string;
}

export class DealCreateAssociationDto {
  @ValidateNested()
  @Type(() => DealAssociationTargetDto)
  to!: DealAssociationTargetDto;

  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => DealAssociationTypeDto)
  types!: DealAssociationTypeDto[];
}

export class CreateHubspotDealDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DealCreateAssociationDto)
  associations?: DealCreateAssociationDto[];
}
