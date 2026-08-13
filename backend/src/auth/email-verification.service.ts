import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { TwilioService } from '../twilio/twilio.service';

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly twilio: TwilioService,
  ) {}

  // Request an email verification OTP code via Twilio Verify.
  async issueCode(
    userId: string,
    email: string,
    _name: string | null,
  ): Promise<void> {
    await this.twilio.sendOtp(email, 'email');
  }

  // Validate a submitted code via Twilio Verify. On success, flips the user's emailVerified flag.
  async verifyCode(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      throw new BadRequestException('User not found.');
    }

    await this.twilio.verifyOtp(user.email, code);

    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });
  }
}
