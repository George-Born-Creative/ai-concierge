import { IsEmail, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Provide a valid email' })
  email?: string;

  // currentPassword is only required when the caller is changing their password.
  @ValidateIf((o: UpdateProfileDto) => Boolean(o.newPassword))
  @IsString()
  @MinLength(1, { message: 'Current password is required to set a new one' })
  currentPassword?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters' })
  newPassword?: string;
}
