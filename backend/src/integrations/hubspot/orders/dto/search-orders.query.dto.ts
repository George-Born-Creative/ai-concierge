import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SearchHubspotOrdersQueryDto {
  /**
   * Free-text query — matched server-side against the order name via HubSpot's
   * CRM Search API.
   */
  @IsString()
  @MaxLength(200)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  after?: string;
}
