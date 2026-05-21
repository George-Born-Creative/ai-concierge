import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';

import { GhlCallbackQueryDto } from './dto/callback.query.dto';
import { handleGhlOAuthCallback } from './ghl-oauth-callback.handler';
import { GhlService } from './ghl.service';

// GHL Marketplace redirect URI (e.g. https://borncreative.net/) — OAuth lands on site root.
@Controller()
export class GhlRootOAuthCallbackController {
  constructor(private readonly ghl: GhlService) {}

  @Get()
  async rootCallback(@Query() query: GhlCallbackQueryDto, @Res() res: Response) {
    await handleGhlOAuthCallback(this.ghl, query, res);
  }
}

// Alternate path kept for local dev (http://localhost:4000/oauth/callback).
@Controller('oauth')
export class GhlOAuthCallbackController {
  constructor(private readonly ghl: GhlService) {}

  @Get('callback')
  async callback(@Query() query: GhlCallbackQueryDto, @Res() res: Response) {
    await handleGhlOAuthCallback(this.ghl, query, res);
  }
}
