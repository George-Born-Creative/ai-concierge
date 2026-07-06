import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Mirrors `HubspotOrderWriteInput` in the service. Property names are camelCase
 * so the REST surface matches the other HubSpot resources and the frontend can
 * use one shared form. The service translates to HubSpot's lowercase property
 * names (`hs_order_name`, `hs_pipeline`, `hs_total_price`, …) at the API
 * boundary.
 *
 * Every field is optional at the validation layer — the service rejects a
 * missing name with `BadRequestException` and defaults the pipeline/stage when
 * absent, so create / update share this DTO.
 */
export class CreateHubspotOrderDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  name?: string;

  /** HubSpot order pipeline id. Defaulted server-side when omitted. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  pipeline?: string;

  /** HubSpot order pipeline stage id. Defaulted server-side when omitted. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  stage?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalPrice?: number;

  /** ISO currency code, e.g. `USD`. */
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  /** Fulfillment / shipping status, e.g. `Packing`. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  sourceStore?: string;

  /** HubSpot owner id (must be a valid owner id). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ownerId?: string;
}
