import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    return plans.map((p) => ({
      id: p.code,
      name: p.name,
      provider: p.provider.toLowerCase(),
      price: `$${(p.monthlyPrice / 100).toFixed(0)}`,
      currency: p.currency,
      features: p.features,
    }));
  }

  async findByCode(code: string) {
    const plan = await this.prisma.plan.findUnique({ where: { code } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException(`Plan "${code}" not found`);
    }
    return plan;
  }
}
