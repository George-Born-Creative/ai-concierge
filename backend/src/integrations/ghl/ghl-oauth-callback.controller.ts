import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';

import { GhlCallbackQueryDto } from './dto/callback.query.dto';
import { handleGhlOAuthCallback } from './ghl-oauth-callback.handler';
import { GhlService } from './ghl.service';

// Neutral path for GHL Marketplace redirect URI (no "ghl" / "highlevel" in the URL).
@Controller('oauth')
export class GhlOAuthCallbackController {
  constructor(private readonly ghl: GhlService) {}

  @Get('callback')
  async callback(@Query() query: GhlCallbackQueryDto, @Res() res: Response) {
    await handleGhlOAuthCallback(this.ghl, query, res);
  }
}
