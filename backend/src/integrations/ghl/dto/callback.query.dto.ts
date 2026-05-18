import { IsOptional, IsString } from 'class-validator';

export class GhlCallbackQueryDto {
  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @IsString()
  error_description?: string;
}
