import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListHubspotTicketsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** HubSpot pagination cursor — opaque, returned as `paging.next.after`. */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  after?: string;

  @IsOptional() @IsString() @MaxLength(3000) properties?: string;
  @IsOptional() @IsString() @MaxLength(3000) propertiesWithHistory?: string;
  @IsOptional() @IsString() @MaxLength(1000) associations?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  archived?: boolean;
}
