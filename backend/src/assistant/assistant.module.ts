import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ConversationModule } from '../conversation/conversation.module';
import { GhlModule } from '../integrations/ghl/ghl.module';
import { VoiceModule } from '../voice/voice.module';
import { AssistantCommandService } from './assistant-command.service';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [AuthModule, GhlModule, VoiceModule, ConversationModule],
  controllers: [AssistantController],
  providers: [AssistantService, AssistantCommandService],
  exports: [AssistantService],
})
export class AssistantModule {}
