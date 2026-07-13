import { CrmProvider, ReminderLinkType } from '@prisma/client';
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

export class UpdateReminderDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

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
}
