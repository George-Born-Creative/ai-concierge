import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SaveOpenAIKeyDto } from './dto/save-key.dto';
import { OpenAIKeysService } from './openai-keys.service';

@Controller('openai/keys')
@UseGuards(JwtAuthGuard)
export class OpenAIKeysController {
  constructor(private readonly keys: OpenAIKeysService) {}

  // POST and re-POST both encrypt+upsert; PUT-style replace lives at the
  // same path so the mobile client doesn't need two endpoints to rotate.
  @Post()
  @HttpCode(200)
  save(@CurrentUser() user: AuthenticatedUser, @Body() dto: SaveOpenAIKeyDto) {
    return this.keys.saveKey(user.id, dto.key);
  }

  @Get()
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.keys.getStatus(user.id);
  }

  @Delete()
  @HttpCode(200)
  remove(@CurrentUser() user: AuthenticatedUser) {
    return this.keys.deleteKey(user.id);
  }
}
