import { IsString, Length } from 'class-validator';

export class VerifyEmailDto {
  // 6-digit numeric code emailed at signup. Kept as a string to preserve any
  // leading zeros (e.g. "004213").
  @IsString()
  @Length(6, 6)
  code!: string;
}
