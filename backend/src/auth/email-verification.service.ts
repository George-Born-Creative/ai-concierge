import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import * as argon2 from 'argon2';

import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

// NestJS 10 has no built-in 429 exception, so define a small helper.
class TooManyRequestsException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

// Max wrong guesses against a single code before it's locked out.
const MAX_ATTEMPTS = 5;
// Minimum seconds between consecutive code sends for one user (anti email-bomb).
const RESEND_COOLDOWN_SECONDS = 30;

@Injectable()
export class EmailVerificationService {
  private readonly ttlMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {
    this.ttlMinutes = Number(
      this.config.get<string>('EMAIL_CODE_TTL_MINUTES') ?? '10',
    );
  }

  // Generate + email a fresh code. Any prior unconsumed codes for the user are
  // invalidated so only the newest one works. Throws if a code was sent within
  // the cooldown window.
  async issueCode(
    userId: string,
    email: string,
    name: string | null,
  ): Promise<void> {
    const latest = await this.prisma.emailVerification.findFirst({
      where: { userId, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (latest) {
      const ageSeconds = (Date.now() - latest.createdAt.getTime()) / 1000;
      if (ageSeconds < RESEND_COOLDOWN_SECONDS) {
        throw new TooManyRequestsException(
          `Please wait ${Math.ceil(
            RESEND_COOLDOWN_SECONDS - ageSeconds,
          )}s before requesting another code.`,
        );
      }
    }

    const code = this.generateCode();
    const codeHash = await argon2.hash(code);
    const expiresAt = new Date(Date.now() + this.ttlMinutes * 60_000);

    // Invalidate previous outstanding codes, then store the new one.
    await this.prisma.$transaction([
      this.prisma.emailVerification.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.emailVerification.create({
        data: { userId, codeHash, expiresAt },
      }),
    ]);

    await this.mail.sendVerificationCode(email, name, code);
  }

  // Validate a submitted code. On success, flips the user's emailVerified flag
  // and marks the code consumed. Returns nothing; throws on any failure.
  async verifyCode(userId: string, code: string): Promise<void> {
    const record = await this.prisma.emailVerification.findFirst({
      where: { userId, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new BadRequestException(
        'No active verification code. Request a new one.',
      );
    }

    if (record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('That code has expired. Request a new one.');
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      throw new TooManyRequestsException(
        'Too many incorrect attempts. Request a new code.',
      );
    }

    const valid = await argon2.verify(record.codeHash, code).catch(() => false);
    if (!valid) {
      await this.prisma.emailVerification.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Incorrect code. Please try again.');
    }

    await this.prisma.$transaction([
      this.prisma.emailVerification.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { emailVerified: true },
      }),
    ]);
  }

  private generateCode(): string {
    // 6-digit, zero-padded so codes like 004213 are valid.
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }
}
