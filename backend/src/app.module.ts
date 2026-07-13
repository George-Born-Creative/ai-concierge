import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { HealthModule } from './health/health.module';
import { GhlModule } from './integrations/ghl/ghl.module';
import { HubspotModule } from './integrations/hubspot/hubspot.module';
import { OpenAIKeysModule } from './openai-keys/openai-keys.module';
import { PlansModule } from './plans/plans.module';
import { PrismaModule } from './prisma/prisma.module';
import { PushModule } from './push/push.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RemindersModule } from './reminders/reminders.module';
import { UsersModule } from './users/users.module';
import { AssistantModule } from './assistant/assistant.module';
import { VoiceModule } from './voice/voice.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    HealthModule,
    PrismaModule,
    RealtimeModule,
    AuthModule,
    UsersModule,
    PlansModule,
    BillingModule,
    GhlModule,
    HubspotModule,
    OpenAIKeysModule,
    VoiceModule,
    AssistantModule,
    PushModule,
    RemindersModule,
  ],
})
export class AppModule {}
