import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListHubspotCompaniesQueryDto {
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
}
