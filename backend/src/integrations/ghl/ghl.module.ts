import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AuthModule } from '../../auth/auth.module';
import { AppointmentsController } from './appointments/appointments.controller';
import { AppointmentsService } from './appointments/appointments.service';
import { CalendarsController } from './calendars/calendars.controller';
import { CalendarsService } from './calendars/calendars.service';
import { ContactsController } from './contacts/contacts.controller';
import { ContactsService } from './contacts/contacts.service';
import { ConversationsController } from './conversations/conversations.controller';
import { ConversationsService } from './conversations/conversations.service';
import { GhlService } from './ghl.service';
import { OpportunitiesController } from './opportunities/opportunities.controller';
import { OpportunitiesService } from './opportunities/opportunities.service';
import { PipelinesController } from './pipelines/pipelines.controller';
import { PipelinesService } from './pipelines/pipelines.service';
import { GhlApiService } from './shared/ghl-api.service';
import {
  GhlIntegrationController,
  GhlOAuthCallbackController,
  GhlRootOAuthCallbackController,
} from './shared/ghl-oauth-callback.controller';
import { GhlWebhookController } from './shared/ghl-webhook.controller';

@Module({
  imports: [
    AuthModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET is not set');
        return { secret };
      },
    }),
  ],
  controllers: [
    GhlIntegrationController,
    ContactsController,
    CalendarsController,
    AppointmentsController,
    OpportunitiesController,
    PipelinesController,
    ConversationsController,
    GhlRootOAuthCallbackController,
    GhlOAuthCallbackController,
    GhlWebhookController,
  ],
  providers: [
    GhlApiService,
    ContactsService,
    CalendarsService,
    AppointmentsService,
    OpportunitiesService,
    PipelinesService,
    ConversationsService,
    GhlService,
  ],
  exports: [GhlService, ConversationsService],
})
export class GhlModule {}
