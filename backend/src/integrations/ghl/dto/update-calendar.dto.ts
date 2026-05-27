import { IsBoolean, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateGhlCalendarDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  options?: Record<string, unknown>;
}
