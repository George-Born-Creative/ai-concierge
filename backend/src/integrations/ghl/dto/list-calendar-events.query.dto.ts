import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListCalendarEventsQueryDto {
  @IsOptional()
  @IsString()
  calendarId?: string;

  @IsOptional()
  @IsString()
  calendarName?: string;

  /** Start of range (ISO 8601). Defaults to now. */
  @IsOptional()
  @IsString()
  startTime?: string;

  /** End of range (ISO 8601). Defaults to start + days. */
  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}
