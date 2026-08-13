import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { RemindersService } from './reminders.service';

@Injectable()
export class RemindersCron {
  private readonly logger = new Logger(RemindersCron.name);

  constructor(private readonly reminders: RemindersService) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async tick(): Promise<void> {
    try {
      const { delivered, failed } = await this.reminders.dispatchDueReminders();
      if (delivered > 0 || failed > 0) {
        this.logger.log(`dispatched - delivered=${delivered} failed=${failed}`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger.error('dispatch tick failed', error.stack);
    }
  }
}
