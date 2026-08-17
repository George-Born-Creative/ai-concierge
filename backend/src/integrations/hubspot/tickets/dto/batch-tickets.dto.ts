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

import { UpdateHubspotTicketDto } from './update-ticket.dto';

export class BatchReadHubspotTicketsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsString({ each: true }) ids!: string[];
  @IsOptional() @IsString() @MaxLength(128) idProperty?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) properties?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true })
  propertiesWithHistory?: string[];
}

export class BatchUpdateHubspotTicketInputDto {
  @IsString() @MaxLength(256) id!: string;
  @IsOptional() @IsString() @MaxLength(128) idProperty?: string;
  @ValidateNested() @Type(() => UpdateHubspotTicketDto) properties!: UpdateHubspotTicketDto;
}

export class BatchUpdateHubspotTicketsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => BatchUpdateHubspotTicketInputDto)
  inputs!: BatchUpdateHubspotTicketInputDto[];
}

export class BatchArchiveHubspotTicketsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsString({ each: true }) ids!: string[];
}
