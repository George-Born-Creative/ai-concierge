import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_RETENTION_DAYS = 180;

@Injectable()
export class SupportRetentionCron {
  private readonly logger = new Logger(SupportRetentionCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Cron('0 3 * * *')
  async removeExpired(): Promise<void> {
    const configured = Number(
      this.config.get<string>(
        'SUPPORT_REQUEST_RETENTION_DAYS',
        String(DEFAULT_RETENTION_DAYS),
      ),
    );
    const retentionDays =
      Number.isFinite(configured) && configured > 0
        ? Math.floor(configured)
        : DEFAULT_RETENTION_DAYS;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await this.prisma.supportRequest.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      this.logger.log(
        `removed ${result.count} support requests older than ${retentionDays} days`,
      );
    }
  }
}
