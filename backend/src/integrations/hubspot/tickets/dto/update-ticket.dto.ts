import { IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateHubspotTicketDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500) subject?: string;
  @IsOptional() @IsString() @MaxLength(5000) content?: string | null;
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']) priority?: string | null;
  @IsOptional() @IsString() @MaxLength(128) pipeline?: string;
  @IsOptional() @IsString() @MaxLength(128) stage?: string;
  @IsOptional() @IsString() @MaxLength(128) ownerId?: string | null;
  @IsOptional() @IsString() @MaxLength(128) pinnedEngagementId?: string | null;
  @IsOptional() @IsObject() properties?: Record<string, string | null>;
}
