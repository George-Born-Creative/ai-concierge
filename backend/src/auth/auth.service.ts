import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';

import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { EmailVerificationService } from './email-verification.service';
import { GoogleSignInDto } from './dto/google-signin.dto';
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
  // Accepted audiences (Web / iOS / Android OAuth client IDs). A Google ID
  // token is only trusted if its `aud` matches one of these.
  private readonly googleClientIds: string[];
  private readonly googleClient = new OAuth2Client();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly emailVerification: EmailVerificationService,
    private readonly config: ConfigService,
  ) {
    this.googleClientIds = (this.config.get<string>('GOOGLE_CLIENT_IDS') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

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

  // Verifies a Google ID token server-side, then finds/links/creates the user
  // and returns the same session shape as signup/signin. Google accounts are
  // trusted as email-verified (Google sets email_verified), so they skip the
  // /verify-email gate.
  async googleSignIn(dto: GoogleSignInDto): Promise<AuthResult> {
    const payload = await this.verifyGoogleToken(dto.idToken);

    const googleId = payload.sub;
    const email = payload.email?.trim().toLowerCase();
    const name = payload.name?.trim();
    const avatarUrl = payload.picture;

    // A verified email is required to safely match/link to an existing account.
    if (!email || payload.email_verified !== true) {
      throw new UnauthorizedException('Google account email is not verified');
    }

    // 1) Returning Google user — matched by their stable Google id.
    let user = await this.prisma.user.findUnique({ where: { googleId } });

    // 2) Existing account with the same email — auto-link Google to it.
    if (!user) {
      const byEmail = await this.prisma.user.findUnique({ where: { email } });
      if (byEmail) {
        user = await this.prisma.user.update({
          where: { id: byEmail.id },
          data: {
            googleId,
            emailVerified: true,
            avatarUrl: byEmail.avatarUrl ?? avatarUrl,
            name: byEmail.name || name || email.split('@')[0],
          },
        });
      }
    }

    // 3) Brand-new user — create a password-less, pre-verified account.
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          name: name || email.split('@')[0],
          googleId,
          avatarUrl,
          emailVerified: true,
          // passwordHash stays null; the user can set one later if they want to
          // also sign in with email/password.
        },
      });
    }

    const profile = await this.users.getProfile(user.id);
    return { token: this.sign(user.id, user.email), user: profile };
  }

  private async verifyGoogleToken(idToken: string): Promise<TokenPayload> {
    if (this.googleClientIds.length === 0) {
      this.logger.error('GOOGLE_CLIENT_IDS is not configured');
      throw new UnauthorizedException('Google sign-in is not available');
    }

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.googleClientIds,
      });
      const payload = ticket.getPayload();
      if (!payload) {
        throw new Error('Empty token payload');
      }
      return payload;
    } catch (err) {
      this.logger.warn(
        `Google ID token verification failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new UnauthorizedException('Invalid Google credential');
    }
  }

  private sign(userId: string, email: string): string {
    return this.jwt.sign({ sub: userId, email });
  }
}
