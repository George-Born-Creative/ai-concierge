import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OpenAIKeysModule } from '../openai-keys/openai-keys.module';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';

@Module({
  imports: [AuthModule, OpenAIKeysModule],
  controllers: [VoiceController],
  providers: [VoiceService],
  exports: [VoiceService],
})
export class VoiceModule {}
