import { IsString, MinLength } from 'class-validator';
import { CalendarV3PayloadDto } from './calendar-v3.dto';

export class CreateGhlCalendarDto extends CalendarV3PayloadDto {
  @IsString()
  @MinLength(1)
  declare name: string;

}
