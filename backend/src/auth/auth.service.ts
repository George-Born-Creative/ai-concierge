import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async signup(dto: SignupDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password);
    const created = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
      },
      select: { id: true, email: true },
    });

    const profile = await this.users.getProfile(created.id);
    return { token: this.sign(created.id, created.email), user: profile };
  }

  async signin(dto: SigninDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
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
