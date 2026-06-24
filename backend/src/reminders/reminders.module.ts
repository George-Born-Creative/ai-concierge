import { Module } from '@nestjs/common';

import { RemindersController } from './reminders.controller';
import { RemindersCron } from './reminders.cron';
import { RemindersService } from './reminders.service';

@Module({
  controllers: [RemindersController],
  providers: [RemindersService, RemindersCron],
  exports: [RemindersService],
})
export class RemindersModule {}
