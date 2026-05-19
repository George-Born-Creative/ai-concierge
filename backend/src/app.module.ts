import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { GhlModule } from './integrations/ghl/ghl.module';
import { HubspotModule } from './integrations/hubspot/hubspot.module';
import { OpenAIKeysModule } from './openai-keys/openai-keys.module';
import { PlansModule } from './plans/plans.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { VoiceModule } from './voice/voice.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    PlansModule,
    BillingModule,
    GhlModule,
    HubspotModule,
    OpenAIKeysModule,
    VoiceModule,
  ],
})
export class AppModule {}
