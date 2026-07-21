import { Module } from '@nestjs/common';

import { MailModule } from '../mail/mail.module';
import { SupportController } from './support.controller';
import { SupportDeliveryCron } from './support-delivery.cron';
import { SupportDeliveryService } from './support-delivery.service';
import { SupportRetentionCron } from './support-retention.cron';
import { SupportService } from './support.service';

@Module({
  imports: [MailModule],
  controllers: [SupportController],
  providers: [
    SupportService,
    SupportDeliveryService,
    SupportDeliveryCron,
    SupportRetentionCron,
  ],
})
export class SupportModule {}
