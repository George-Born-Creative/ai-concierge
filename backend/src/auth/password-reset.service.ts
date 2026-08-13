import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';

import { PrismaService } from '../prisma/prisma.service';
import { TwilioService } from '../twilio/twilio.service';

/**
 * Owns the password-reset code lifecycle using Twilio Verify API for email OTP.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly twilio: TwilioService,
  ) {}

  // Request a password reset email OTP.
  async issueCode(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, email: true, name: true, passwordHash: true },
    });

    // No account for this email — the user needs to sign up instead.
    if (!user) {
      throw new NotFoundException(
        'No account found with this email. Please sign up first.',
      );
    }

    // Account exists but was created with Google Sign-In, so there's no password to reset.
    if (!user.passwordHash) {
      throw new BadRequestException(
        'This account uses Google Sign-In. Use "Continue with Google" to sign in.',
      );
    }

    await this.twilio.sendOtp(user.email, 'email');
  }

  // Validate a submitted code and set the new password.
  async resetPassword(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true },
    });

    const genericError = new BadRequestException(
      'Invalid or expired code. Request a new one.',
    );

    if (!user) {
      throw genericError;
    }

    await this.twilio.verifyOtp(normalized, code);

    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
  }
}
