import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';

import { UpdateProfileDto } from '../auth/dto/update-profile.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscription: { include: { plan: true } },
        integrations: { select: { provider: true, enabled: true, createdAt: true } },
        openaiKey: { select: { last4: true, createdAt: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      timezone: user.timezone,
      hasPushToken: Boolean(user.expoPushToken),
      plan: user.subscription?.plan
        ? {
            id: user.subscription.plan.code,
            name: user.subscription.plan.name,
            provider: user.subscription.plan.provider.toLowerCase(),
            status: user.subscription.status.toLowerCase(),
            // Discriminator the mobile app uses to branch the "manage
            // subscription" UI: Apple subs need a deep link to App Store
            // Settings, Stripe subs use the cancel endpoint.
            paymentProvider: user.subscription.paymentProvider.toLowerCase(),
            appleProductId: user.subscription.plan.appleProductId,
          }
        : null,
      provider: user.subscription?.plan.provider.toLowerCase() ?? null,
      hasIntegration: user.integrations.some((i) => i.enabled),
      hasOpenAIKey: Boolean(user.openaiKey),
      openAIKeyLast4: user.openaiKey?.last4 ?? null,
    };
  }

  async updatePushToken(userId: string, token: string | null) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { expoPushToken: token },
    });
    return { ok: true, hasPushToken: token !== null };
  }

  async updateTimezone(userId: string, timezone: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { timezone },
    });
    return { ok: true, timezone };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const trimmedName = dto.name?.trim();
    const normalizedEmail = dto.email?.trim().toLowerCase();
    const newPassword = dto.newPassword;
    const currentPassword = dto.currentPassword;

    const hasNameChange = typeof trimmedName === 'string' && trimmedName.length > 0;
    const hasEmailChange = typeof normalizedEmail === 'string' && normalizedEmail.length > 0;
    const hasPasswordChange = typeof newPassword === 'string' && newPassword.length > 0;

    if (!hasNameChange && !hasEmailChange && !hasPasswordChange) {
      throw new BadRequestException('Nothing to update');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const data: { name?: string; email?: string; passwordHash?: string } = {};

    if (hasNameChange && trimmedName !== user.name) {
      data.name = trimmedName;
    }

    if (hasEmailChange && normalizedEmail !== user.email.toLowerCase()) {
      const collision = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (collision && collision.id !== user.id) {
        throw new ConflictException('Another account already uses that email');
      }
      data.email = normalizedEmail;
    }

    if (hasPasswordChange) {
      if (user.passwordHash) {
        // Existing password → require and verify the current one before change.
        if (!currentPassword) {
          throw new BadRequestException('Current password is required to set a new one');
        }
        const valid = await argon2.verify(user.passwordHash, currentPassword);
        if (!valid) {
          throw new UnauthorizedException('Current password is incorrect');
        }
        const sameAsOld = await argon2
          .verify(user.passwordHash, newPassword)
          .catch(() => false);
        if (sameAsOld) {
          throw new BadRequestException('New password must be different from the current one');
        }
      }
      // No existing password (Google-only account) → this is a first-time
      // "set password", so no current password is required.
      data.passwordHash = await argon2.hash(newPassword);
    }

    if (Object.keys(data).length === 0) {
      // All provided fields matched existing values — return current profile.
      return this.getProfile(userId);
    }

    await this.prisma.user.update({ where: { id: userId }, data });
    return this.getProfile(userId);
  }
}
