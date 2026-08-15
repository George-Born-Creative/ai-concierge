import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { UpdateHubspotDealDto } from './update-deal.dto';

export class BatchReadHubspotDealsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idProperty?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  properties?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  propertiesWithHistory?: string[];
}

export class BatchUpdateHubspotDealInputDto {
  @IsString()
  @MaxLength(256)
  id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idProperty?: string;

  @ValidateNested()
  @Type(() => UpdateHubspotDealDto)
  properties!: UpdateHubspotDealDto;
}

export class BatchUpdateHubspotDealsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BatchUpdateHubspotDealInputDto)
  inputs!: BatchUpdateHubspotDealInputDto[];
}

export class BatchArchiveHubspotDealsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];
}
