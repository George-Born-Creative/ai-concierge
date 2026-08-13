import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Mirrors `HubspotContactWriteInput` in the service. We keep the property
 * names camelCase so the REST surface matches the GHL contact DTO and the
 * frontend can use one shared form regardless of CRM. The service translates
 * to HubSpot's lowercase property names (`firstname`, `lastname`, …) at the
 * API boundary.
 */
export class CreateHubspotContactDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  lifecycleStage?: string;
}
