import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class HubspotTicketAssociationTypeDto {
  @IsIn(['HUBSPOT_DEFINED', 'USER_DEFINED', 'INTEGRATOR_DEFINED'])
  associationCategory!: 'HUBSPOT_DEFINED' | 'USER_DEFINED' | 'INTEGRATOR_DEFINED';

  @Type(() => Number) @IsInt() @Min(1) associationTypeId!: number;
}

export class HubspotTicketCreateAssociationDto {
  @IsString() @MinLength(1) toId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HubspotTicketAssociationTypeDto)
  types!: HubspotTicketAssociationTypeDto[];
}

export class CreateHubspotTicketDto {
  @IsString() @MinLength(1) @MaxLength(500) subject!: string;
  @IsOptional() @IsString() @MaxLength(5000) content?: string;
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']) priority?: string;
  @IsOptional() @IsString() @MaxLength(128) pipeline?: string;
  @IsOptional() @IsString() @MaxLength(128) stage?: string;
  @IsOptional() @IsString() @MaxLength(128) ownerId?: string;
  @IsOptional() @IsString() @MaxLength(128) pinnedEngagementId?: string;
  @IsOptional() @IsObject() properties?: Record<string, string | null>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HubspotTicketCreateAssociationDto)
  associations?: HubspotTicketCreateAssociationDto[];
}
