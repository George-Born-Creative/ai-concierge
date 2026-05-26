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
import { InterpretCommandDto } from './dto/interpret.dto';
import { VoiceService } from './voice.service';

// 25 MB matches the Whisper single-upload cap; the service double-checks.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

@Controller('voice')
@UseGuards(JwtAuthGuard)
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

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
  ) {
    return this.voice.transcribe(user.id, file);
  }

  @Post('interpret')
  @HttpCode(200)
  interpret(@CurrentUser() user: AuthenticatedUser, @Body() body: InterpretCommandDto) {
    return this.voice.interpret(user.id, body.text);
  }
}
