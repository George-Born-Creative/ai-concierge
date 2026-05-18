import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OpenAIKeysController } from './openai-keys.controller';
import { OpenAIKeysService } from './openai-keys.service';

@Module({
  imports: [AuthModule],
  controllers: [OpenAIKeysController],
  providers: [OpenAIKeysService],
  exports: [OpenAIKeysService],
})
export class OpenAIKeysModule {}
