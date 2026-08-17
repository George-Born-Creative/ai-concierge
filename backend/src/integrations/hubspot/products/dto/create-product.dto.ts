import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export enum HubspotProductPricingModelDto {
  VOLUME = 'volume',
  GRADUATED = 'graduated',
  STAIRSTEP = 'stairstep',
}

export class HubspotProductTierRangeDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  start!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  end?: number;
}

export class HubspotProductTierPriceDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  index!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'currency must be a three-letter ISO code' })
  currency?: string;
}

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

  /** ISO-8601 month duration used by HubSpot, for example P12M. */
  @IsOptional()
  @IsString()
  @Matches(/^P[1-9]\d*M$/, { message: 'recurringBillingPeriod must use P#M (for example P12M)' })
  recurringBillingPeriod?: string;

  @IsOptional()
  @IsEnum(HubspotProductPricingModelDto)
  pricingModel?: HubspotProductPricingModelDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => HubspotProductTierRangeDto)
  tierRanges?: HubspotProductTierRangeDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => HubspotProductTierPriceDto)
  tierPrices?: HubspotProductTierPriceDto[];
}
