import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
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

/**
 * Owns the password-reset code lifecycle. Mirrors {@link EmailVerificationService}
 * (6-digit argon2-hashed codes, single-use, expiring, attempt-limited) but with
 * two important differences:
 *   1. It is driven by *email* (the user is unauthenticated), not a userId from
 *      a JWT.
 *   2. Consuming a code sets a new `passwordHash` instead of flipping
 *      `emailVerified`.
 *
 * Both public entry points are enumeration-safe: `issueCode` never reveals
 * whether an account exists, and `resetPassword` returns the same generic error
 * for "no such account" and "no/expired code".
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
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

  // Generate + email a fresh reset code for the account with this email. Any
  // prior unconsumed codes for the user are invalidated so only the newest one
  // works. Silently returns for unknown or password-less (Google-only) accounts
  // so the response can't be used to probe which emails are registered. Throws
  // only when a code was already sent within the cooldown window.
  async issueCode(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, email: true, name: true, passwordHash: true },
    });

    // No account, or a Google-only account with no password to reset. Do
    // nothing — but don't leak that back to the caller.
    if (!user || !user.passwordHash) {
      return;
    }

    const latest = await this.prisma.passwordReset.findFirst({
      where: { userId: user.id, consumedAt: null },
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
      this.prisma.passwordReset.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.passwordReset.create({
        data: { userId: user.id, codeHash, expiresAt },
      }),
    ]);

    // Don't fail the request if the email hiccups — mirror signup's behavior so
    // a transient mail outage doesn't surface as a hard error to the user.
    try {
      await this.mail.sendPasswordResetCode(user.email, user.name, code);
    } catch (err) {
      this.logger.error(
        `Password-reset code stored but email failed for ${user.email}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // Validate a submitted code and set the new password. On success, marks the
  // code consumed and updates the user's passwordHash in one transaction.
  // Returns nothing; throws on any failure with enumeration-safe messages.
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

    // Same generic error whether the account is missing or simply has no active
    // code, so callers can't distinguish the two.
    const genericError = new BadRequestException(
      'Invalid or expired code. Request a new one.',
    );

    if (!user) {
      throw genericError;
    }

    const record = await this.prisma.passwordReset.findFirst({
      where: { userId: user.id, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw genericError;
    }

    if (record.expiresAt.getTime() < Date.now()) {
      throw genericError;
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      throw new TooManyRequestsException(
        'Too many incorrect attempts. Request a new code.',
      );
    }

    const valid = await argon2.verify(record.codeHash, code).catch(() => false);
    if (!valid) {
      await this.prisma.passwordReset.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Incorrect code. Please try again.');
    }

    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.passwordReset.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
    ]);
  }

  private generateCode(): string {
    // 6-digit, zero-padded so codes like 004213 are valid.
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }
}
