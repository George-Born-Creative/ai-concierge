import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { TwilioService } from './twilio.service';

@Controller('auth')
export class TwilioController {
  constructor(private readonly twilioService: TwilioService) {}

  @Post('send-otp')
  @HttpCode(200)
  sendOtp(@Body() dto: SendOtpDto) {
    return this.twilioService.sendOtp(dto.recipient, dto.channel);
  }

  @Post('verify-otp')
  @HttpCode(200)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.twilioService.verifyOtp(dto.recipient, dto.code);
  }
}
