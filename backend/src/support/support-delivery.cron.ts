import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { SupportDeliveryService } from './support-delivery.service';

@Injectable()
export class SupportDeliveryCron {
  private readonly logger = new Logger(SupportDeliveryCron.name);

  constructor(private readonly delivery: SupportDeliveryService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    try {
      const result = await this.delivery.retryOutstanding();
      if (result.delivered > 0 || result.confirmed > 0 || result.failed > 0) {
        this.logger.log(
          `support delivery tick - delivered=${result.delivered} confirmed=${result.confirmed} failed=${result.failed}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `support delivery tick failed: ${
          error instanceof Error ? error.name : 'unknown_error'
        }`,
      );
    }
  }
}
