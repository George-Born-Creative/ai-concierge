import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';

import { GhlCallbackQueryDto } from './dto/callback.query.dto';
import { handleGhlOAuthCallback } from './ghl-oauth-callback.handler';
import { GhlService } from './ghl.service';

// GHL Marketplace redirect URI (e.g. https://borncreative.net/) — OAuth lands on site root.
@Controller()
export class GhlRootOAuthCallbackController {
  constructor(private readonly ghl: GhlService) {}

  @Get()
  async rootCallback(
    @Query() query: GhlCallbackQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await handleGhlOAuthCallback(this.ghl, query, res, getRequestOrigin(req));
  }
}

// Alternate path kept for local dev (http://localhost:4000/oauth/callback).
@Controller('oauth')
export class GhlOAuthCallbackController {
  constructor(private readonly ghl: GhlService) {}

  @Get('callback')
  async callback(
    @Query() query: GhlCallbackQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await handleGhlOAuthCallback(this.ghl, query, res, getRequestOrigin(req));
  }
}

function getRequestOrigin(req: Request): string {
  const proto = req.headers['x-forwarded-proto'];
  const protocol = typeof proto === 'string' ? proto.split(',')[0].trim() : req.protocol;
  const host = req.get('host') ?? 'localhost:4000';
  return `${protocol}://${host}`;
}
