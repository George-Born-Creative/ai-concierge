import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

import type { OtpChannel } from '../twilio.service';

export class SendOtpDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^(?:[^\s@]+@[^\s@]+\.[^\s@]+|\+[1-9]\d{7,14})$/, {
    message: 'recipient must be a valid email address or E.164 phone number',
  })
  recipient: string;

  @IsOptional()
  @IsIn(['email', 'sms'])
  channel?: OtpChannel;
}
