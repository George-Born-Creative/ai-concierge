import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

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
}
