import { IsBoolean, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateGhlCalendarDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Additional GHL calendar fields (slotDuration, eventType, teamMembers, etc.). */
  @IsOptional()
  @IsObject()
  options?: Record<string, unknown>;
}
