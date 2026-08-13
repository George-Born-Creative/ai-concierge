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
 * Mirrors `HubspotProductWriteInput` in the service. Property names are
 * camelCase so the REST surface matches the other HubSpot resources and the
 * frontend can use one shared form. The service translates to HubSpot's
 * lowercase property names (`hs_sku`, `hs_cost_of_goods_sold`, …) at the API
 * boundary.
 *
 * Every field is optional at the validation layer — the service rejects a
 * missing name with `BadRequestException`, so create / update share this DTO.
 */
export class CreateHubspotProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  /** Cost of goods sold — HubSpot's `hs_cost_of_goods_sold`. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cost?: number;
}
