import { IsDateString, IsIn, IsOptional } from 'class-validator';

export type SnoozePreset = '10m' | '1h' | 'tomorrow9';

const SNOOZE_PRESETS: SnoozePreset[] = ['10m', '1h', 'tomorrow9'];

export class SnoozeReminderDto {
  @IsOptional()
  @IsDateString()
  snoozeUntil?: string;

  @IsOptional()
  @IsIn(SNOOZE_PRESETS)
  preset?: SnoozePreset;
}
