import { Controller, Get, HttpCode, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';

import { AuthenticatedUser, CurrentUser } from '../../../common/current-user.decorator';
import { ActiveSubscriptionGuard } from '../../../common/guards/active-subscription.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { GhlCallbackQueryDto } from '../dto/callback.query.dto';
import { handleGhlOAuthCallback, handleGhlOAuthFinish } from './ghl-oauth-callback.handler';
import { GhlService } from '../ghl.service';

@Controller('integrations/ghl')
export class GhlIntegrationController {
  constructor(private readonly ghl: GhlService) {}

  @Get('auth-url')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  authUrl(@CurrentUser() user: AuthenticatedUser, @Query('returnUrl') returnUrl?: string) {
    return this.ghl.buildAuthUrl(user.id, returnUrl);
  }

  @Get('callback')
  async callback(@Query() query: GhlCallbackQueryDto, @Req() req: Request, @Res() res: Response) {
    await handleGhlOAuthCallback(this.ghl, query, res, getRequestOrigin(req));
  }

  @Get('finish')
  finish(@Query() query: GhlCallbackQueryDto) {
    return handleGhlOAuthFinish(this.ghl, query);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: AuthenticatedUser) { return this.ghl.getStatus(user.id); }

  @Post('disconnect')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  disconnect(@CurrentUser() user: AuthenticatedUser) { return this.ghl.disconnect(user.id); }

  @Post('reconnect')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  reconnect(@CurrentUser() user: AuthenticatedUser, @Query('returnUrl') returnUrl?: string) {
    return this.ghl.reconnect(user.id, returnUrl);
  }
}
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
    // WordPress/nginx may forward only GHL callbacks here. Ignore normal homepage hits.
    if (!query.code && !query.state && !query.error) {
      res.status(404).json({ statusCode: 404, message: 'Not found' });
      return;
    }
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
