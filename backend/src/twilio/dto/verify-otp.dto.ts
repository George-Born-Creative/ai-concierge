import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^(?:[^\s@]+@[^\s@]+\.[^\s@]+|\+[1-9]\d{7,14})$/, {
    message: 'recipient must be a valid email address or E.164 phone number',
  })
  recipient: string;

  @IsNotEmpty()
  @IsString()
  code: string;
}
