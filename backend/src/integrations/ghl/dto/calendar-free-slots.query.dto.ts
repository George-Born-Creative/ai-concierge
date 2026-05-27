import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CalendarFreeSlotsQueryDto {
  @Type(() => Number)
  @IsInt()
  startDate!: number;

  @Type(() => Number)
  @IsInt()
  endDate!: number;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  userId?: string;
}
