import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ConversationModule } from '../conversation/conversation.module';
import { GhlModule } from '../integrations/ghl/ghl.module';
import { HubspotModule } from '../integrations/hubspot/hubspot.module';
import { VoiceModule } from '../voice/voice.module';
import { AssistantCommandService } from './assistant-command.service';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { HubspotCommandService } from './hubspot-command.service';

@Module({
  imports: [AuthModule, GhlModule, HubspotModule, VoiceModule, ConversationModule],
  controllers: [AssistantController],
  providers: [AssistantService, AssistantCommandService, HubspotCommandService],
  exports: [AssistantService, AssistantCommandService],
})
export class AssistantModule {}
