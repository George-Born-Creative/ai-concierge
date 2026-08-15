import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SearchHubspotTicketsQueryDto {
  /**
   * Free-text query — matched server-side against `subject` and `content`
   * via HubSpot's CRM Search API.
   */
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  q?: string;

  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']) priority?: string;
  @IsOptional() @IsString() @MaxLength(128) pipeline?: string;
  @IsOptional() @IsString() @MaxLength(128) stage?: string;
  @IsOptional() @IsString() @MaxLength(128) ownerId?: string;
  @IsOptional()
  @IsIn(['updated_desc', 'updated_asc', 'created_desc', 'created_asc'])
  sort?: 'updated_desc' | 'updated_asc' | 'created_desc' | 'created_asc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  after?: string;
}
