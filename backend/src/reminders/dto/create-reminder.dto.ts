import { AssistantMessageSource, CrmProvider, ReminderLinkType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateReminderDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  // The event/target time. The notification fires `remindOffsetMinutes` before.
  @IsDateString()
  dueAt!: string;

  // Minutes before the event to notify (0 = at the event). Defaults to 15.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10080)
  remindOffsetMinutes?: number;

  @IsOptional()
  @IsEnum(ReminderLinkType)
  linkType?: ReminderLinkType;

  @IsOptional()
  @IsEnum(CrmProvider)
  linkProvider?: CrmProvider;

  @IsOptional()
  @IsString()
  linkExternalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  linkLabel?: string;

  @IsOptional()
  @IsEnum(AssistantMessageSource)
  source?: AssistantMessageSource;
}
