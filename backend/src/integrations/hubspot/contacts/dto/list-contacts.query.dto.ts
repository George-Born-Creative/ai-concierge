import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListHubspotContactsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /**
   * HubSpot pagination cursor returned as `paging.next.after` on the previous
   * page. Opaque string — pass through verbatim.
   */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  after?: string;
}
