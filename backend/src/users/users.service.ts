import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { CrmProvider, Plan, Subscription } from '@prisma/client';
import * as argon2 from 'argon2';

import { UpdateActiveProviderDto } from '../auth/dto/update-active-provider.dto';
import { UpdateProfileDto } from '../auth/dto/update-profile.dto';
import {
  crmKey,
  isActiveSubscriptionStatus,
  parseCrmProvider,
  userHasCrmConnection,
  userHasCrmPlan,
} from '../common/crm-account';
import { crmLabel } from '../common/crm-labels';
import { PrismaService } from '../prisma/prisma.service';

type SubscriptionWithPlan = Subscription & { plan: Plan };

type ProfileUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  timezone: string | null;
  expoPushToken: string | null;
  activeCrmProvider: CrmProvider | null;
  subscriptions: SubscriptionWithPlan[];
  integrations: Array<{
    provider: CrmProvider;
    enabled: boolean;
    createdAt: Date;
  }>;
  openaiKey: { last4: string; createdAt: Date } | null;
};

function toPlanDto(sub: SubscriptionWithPlan) {
  return {
    id: sub.plan.code,
    name: sub.plan.name,
    provider: crmKey(sub.plan.provider),
    status: sub.status.toLowerCase(),
    // Discriminator the mobile app uses to branch the "manage
    // subscription" UI: Apple subs need a deep link to App Store
    // Settings, Stripe subs use the cancel endpoint.
    paymentProvider: sub.paymentProvider.toLowerCase(),
    appleProductId: sub.plan.appleProductId,
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = (await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscriptions: { include: { plan: true } },
        integrations: { select: { provider: true, enabled: true, createdAt: true } },
        openaiKey: { select: { last4: true, createdAt: true } },
      },
    })) as ProfileUser | null;

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const entitlements = { ghl: false, hubspot: false };
    const integrations = { ghl: false, hubspot: false };
    for (const sub of user.subscriptions) {
      if (isActiveSubscriptionStatus(sub.status)) {
        entitlements[crmKey(sub.plan.provider)] = true;
      }
    }
    for (const row of user.integrations) {
      if (row.enabled) integrations[crmKey(row.provider)] = true;
    }

    const activeProvider = user.activeCrmProvider;
    const activeSub =
      user.subscriptions.find((sub) => sub.plan.provider === activeProvider) ??
      user.subscriptions.find((sub) => isActiveSubscriptionStatus(sub.status)) ??
      user.subscriptions[0] ??
      null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      timezone: user.timezone,
      hasPushToken: Boolean(user.expoPushToken),
      plan: activeSub ? toPlanDto(activeSub) : null,
      plans: user.subscriptions.map(toPlanDto),
      entitlements,
      integrations,
      provider: activeProvider ? crmKey(activeProvider) : null,
      hasIntegration: user.integrations.some((i) => i.enabled),
      hasOpenAIKey: Boolean(user.openaiKey),
      openAIKeyLast4: user.openaiKey?.last4 ?? null,
    };
  }

  async setActiveProvider(userId: string, dto: UpdateActiveProviderDto) {
    const provider = parseCrmProvider(dto.provider);
    if (!provider) {
      throw new BadRequestException('provider must be ghl or hubspot');
    }

    if (!(await userHasCrmPlan(this.prisma, userId, provider))) {
      throw new BadRequestException(
        `Subscribe to the ${crmLabel(provider)} plan before using ${crmLabel(provider)}.`,
      );
    }
    if (!(await userHasCrmConnection(this.prisma, userId, provider))) {
      throw new BadRequestException(
        `Connect ${crmLabel(provider)} before switching to it.`,
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { activeCrmProvider: provider },
    });
    return this.getProfile(userId);
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
