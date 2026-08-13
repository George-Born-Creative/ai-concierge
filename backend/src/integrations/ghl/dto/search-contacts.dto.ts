import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class GhlContactSearchSortDto {
  @IsString()
  field!: string;

  @IsIn(['asc', 'desc'])
  direction!: 'asc' | 'desc';
}

export class SearchGhlContactsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @IsString() query?: string;
  @IsOptional() @IsArray() @IsObject({ each: true }) filters?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GhlContactSearchSortDto)
  sort?: GhlContactSearchSortDto[];
}
