import { Module } from '@nestjs/common';

import { OpenAIKeysModule } from '../openai-keys/openai-keys.module';
import { ConversationService } from './conversation.service';

@Module({
  imports: [OpenAIKeysModule],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}
