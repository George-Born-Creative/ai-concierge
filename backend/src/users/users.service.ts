import { Injectable, NotFoundException } from '@nestjs/common';

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
      plan: user.subscription?.plan
        ? {
            id: user.subscription.plan.code,
            name: user.subscription.plan.name,
            provider: user.subscription.plan.provider.toLowerCase(),
            status: user.subscription.status.toLowerCase(),
          }
        : null,
      provider: user.subscription?.plan.provider.toLowerCase() ?? null,
      hasIntegration: user.integrations.some((i) => i.enabled),
      hasOpenAIKey: Boolean(user.openaiKey),
      openAIKeyLast4: user.openaiKey?.last4 ?? null,
    };
  }
}
