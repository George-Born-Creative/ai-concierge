import { IsOptional, IsString, MinLength } from 'class-validator';
import { CalendarV3PayloadDto } from './calendar-v3.dto';

export class UpdateGhlCalendarDto extends CalendarV3PayloadDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  declare name?: string;

}
