import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CrmProvider, SubscriptionStatus } from '@prisma/client';

import { crmLabel } from '../crm-labels';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../current-user.decorator';
import { REQUIRE_CRM_PLAN_KEY } from './require-crm-plan.decorator';

const ACTIVE: SubscriptionStatus[] = [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING];

@Injectable()
export class ActiveSubscriptionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const required = this.reflector.getAllAndOverride<CrmProvider | undefined>(
      REQUIRE_CRM_PLAN_KEY,
      [context.getHandler(), context.getClass()],
    );

    const subscriptions = await this.prisma.subscription.findMany({
      where: { userId: user.id, status: { in: ACTIVE } },
      select: { plan: { select: { provider: true } } },
    });
    if (subscriptions.length === 0) {
      throw new ForbiddenException('An active subscription is required');
    }
    if (required && !subscriptions.some((row) => row.plan.provider === required)) {
      throw new ForbiddenException(
        `An active ${crmLabel(required)} subscription is required`,
      );
    }

    return true;
  }
}
