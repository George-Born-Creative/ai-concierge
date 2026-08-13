import {
  Body,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RealtimeService } from '../realtime/realtime.service';
import { InterpretCommandDto } from './dto/interpret.dto';
import type { TranscribeResult } from './voice.service';
import { VoiceService } from './voice.service';

// 25 MB matches the Whisper single-upload cap; the service double-checks.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

@Controller('voice')
@UseGuards(JwtAuthGuard)
export class VoiceController {
  constructor(
    private readonly voice: VoiceService,
    private readonly realtime: RealtimeService,
  ) {}

  @Post('transcribe')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  transcribe(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    // When the client passes a requestId we stream partial transcript deltas
    // back over the socket (Sprint 5). Without it, behaviour is unchanged.
    @Body('requestId') requestId?: string,
  ): Promise<TranscribeResult> {
    if (requestId) {
      return this.transcribeStreaming(user.id, file, requestId);
    }
    return this.voice.transcribe(user.id, file);
  }

  private async transcribeStreaming(
    userId: string,
    file: Express.Multer.File,
    requestId: string,
  ): Promise<TranscribeResult> {
    const result = await this.voice.transcribeStream(userId, file, (delta) => {
      this.realtime.emitToUser(userId, 'voice.transcribe.delta', { requestId, delta });
    });
    this.realtime.emitToUser(userId, 'voice.transcribe.done', {
      requestId,
      transcript: result.transcript,
    });
    return result;
  }

  @Post('interpret')
  @HttpCode(200)
  interpret(@CurrentUser() user: AuthenticatedUser, @Body() body: InterpretCommandDto) {
    return this.voice.interpret(user.id, body.text);
  }
}
