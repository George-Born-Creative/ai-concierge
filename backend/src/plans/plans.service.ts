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
      // Stripe / web price (also used as the discounted "subscribe via web" price on iOS).
      monthlyPrice: p.monthlyPrice,
      monthlyPriceDisplay: formatPrice(p.monthlyPrice, p.currency),
      // Apple IAP price set in App Store Connect; null when the plan isn't sold via Apple.
      applePrice: p.applePrice,
      applePriceDisplay:
        p.applePrice != null ? formatPrice(p.applePrice, p.currency) : null,
      appleProductId: p.appleProductId,
      // Kept for backwards compatibility with any older clients reading `price`.
      price: formatPrice(p.monthlyPrice, p.currency),
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

function formatPrice(amountCents: number, currency: string): string {
  // Whole-dollar display today (no plan has fractional cents). When we add
  // localised currencies, swap to Intl.NumberFormat per-currency.
  const symbol = currency.toLowerCase() === 'usd' ? '$' : '';
  return `${symbol}${(amountCents / 100).toFixed(0)}`;
}
