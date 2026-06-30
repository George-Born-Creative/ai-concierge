import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { EmailVerificationService } from './email-verification.service';
import { SigninDto } from './dto/signin.dto';
import { SignupDto } from './dto/signup.dto';

// Signin and signup both return the full profile (same shape as GET /auth/me)
// so the mobile auth gate can route the user straight to their next
// onboarding step without an extra round trip.
type AuthResult = {
  token: string;
  user: Awaited<ReturnType<UsersService['getProfile']>>;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  async signup(dto: SignupDto): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password);
    const created = await this.prisma.user.create({
      data: {
        email,
        name: dto.name,
        passwordHash,
        // emailVerified defaults to false; the user must confirm the emailed
        // code before the app lets them past the /verify-email gate.
      },
      select: { id: true, email: true, name: true },
    });

    // Fire off the verification email. Don't fail the whole signup if the
    // email send hiccups — the user is created and can hit "Resend code".
    try {
      await this.emailVerification.issueCode(created.id, created.email, created.name);
    } catch (err) {
      this.logger.error(
        `Signup succeeded but verification email failed for ${created.email}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const profile = await this.users.getProfile(created.id);
    return { token: this.sign(created.id, created.email), user: profile };
  }

  // Called by POST /auth/verify-email. The user is already authenticated (JWT
  // from signup), so we trust `userId` from the token.
  async verifyEmail(userId: string, code: string) {
    await this.emailVerification.verifyCode(userId, code);
    return this.users.getProfile(userId);
  }

  // Called by POST /auth/resend-code. No-op (silently) if already verified.
  async resendCode(userId: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, emailVerified: true },
    });
    if (user && !user.emailVerified) {
      await this.emailVerification.issueCode(userId, user.email, user.name);
    }
    return { ok: true };
  }

  async signin(dto: SigninDto): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Google-only accounts have no password. Return the generic error (rather
    // than "use Google") to avoid leaking which accounts exist / how they were
    // created.
    if (!user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const profile = await this.users.getProfile(user.id);
    return { token: this.sign(user.id, user.email), user: profile };
  }

  private sign(userId: string, email: string): string {
    return this.jwt.sign({ sub: userId, email });
  }
}
