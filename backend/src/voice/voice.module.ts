import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OpenAIKeysModule } from '../openai-keys/openai-keys.module';
import { GrammarCorrectorService } from './grammar-corrector.service';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';

@Module({
  imports: [AuthModule, OpenAIKeysModule],
  controllers: [VoiceController],
  providers: [VoiceService, GrammarCorrectorService],
  exports: [VoiceService, GrammarCorrectorService],
})
export class VoiceModule {}

