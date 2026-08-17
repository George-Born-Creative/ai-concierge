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

import { UpdateHubspotCompanyDto } from './update-company.dto';

export class BatchReadHubspotCompaniesDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsString({ each: true }) ids!: string[];
  @IsOptional() @IsString() @MaxLength(128) idProperty?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) properties?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) propertiesWithHistory?: string[];
}

export class BatchUpdateHubspotCompanyInputDto {
  @IsString() @MaxLength(256) id!: string;
  @IsOptional() @IsString() @MaxLength(128) idProperty?: string;
  @ValidateNested() @Type(() => UpdateHubspotCompanyDto) properties!: UpdateHubspotCompanyDto;
}

export class BatchUpdateHubspotCompaniesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BatchUpdateHubspotCompanyInputDto)
  inputs!: BatchUpdateHubspotCompanyInputDto[];
}

export class BatchArchiveHubspotCompaniesDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsString({ each: true }) ids!: string[];
}
