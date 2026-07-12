import { Module } from '@nestjs/common';

import { GhlModule } from '../integrations/ghl/ghl.module';
import { AppointmentReminderSyncService } from './appointment-sync.service';
import { RemindersController } from './reminders.controller';
import { RemindersCron } from './reminders.cron';
import { RemindersService } from './reminders.service';

@Module({
  imports: [GhlModule],
  controllers: [RemindersController],
  providers: [RemindersService, RemindersCron, AppointmentReminderSyncService],
  exports: [RemindersService],
})
export class RemindersModule {}
