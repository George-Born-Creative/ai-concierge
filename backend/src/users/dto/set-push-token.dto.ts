import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class SetPushTokenDto {
  // Null clears the token (e.g. logout, permission revoked). Non-null is the
  // raw Expo push token string (e.g. "ExponentPushToken[xxxxxxxx]").
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  @IsOptional()
  token!: string | null;
}
