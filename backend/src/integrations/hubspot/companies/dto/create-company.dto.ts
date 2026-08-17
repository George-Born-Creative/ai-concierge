import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class CompanyAssociationTypeDto {
  @IsIn(['HUBSPOT_DEFINED', 'USER_DEFINED', 'INTEGRATOR_DEFINED'])
  associationCategory!: 'HUBSPOT_DEFINED' | 'USER_DEFINED' | 'INTEGRATOR_DEFINED';

  @IsInt()
  @Min(1)
  associationTypeId!: number;
}

class CompanyAssociationTargetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  id!: string;
}

export class CompanyCreateAssociationDto {
  @ValidateNested()
  @Type(() => CompanyAssociationTargetDto)
  to!: CompanyAssociationTargetDto;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CompanyAssociationTypeDto)
  types!: CompanyAssociationTypeDto[];
}

/**
 * Mirrors `HubspotCompanyWriteInput` in the service. We keep the property
 * names camelCase so the REST surface matches the contacts DTO and the
 * frontend can use one shared form regardless of CRM. The service
 * translates to HubSpot's lowercase property names (`numberofemployees`,
 * etc.) at the API boundary.
 *
 * Every field is optional at the validation layer — the service rejects
 * an empty body with `BadRequestException`, mirroring the contacts flow.
 * That keeps create / update sharing the same DTO without needing
 * `PartialType` plumbing.
 */
export class CreateHubspotCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  domain?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  additionalDomains?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  numberOfEmployees?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUrl({ require_protocol: false })
  @MaxLength(500)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  lifecycleStage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ownerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  pinnedEngagementId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CompanyCreateAssociationDto)
  associations?: CompanyCreateAssociationDto[];
}
