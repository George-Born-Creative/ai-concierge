import {
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';

import { AuthenticatedUser, CurrentUser } from '../../common/current-user.decorator';
import { ActiveSubscriptionGuard } from '../../common/guards/active-subscription.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GhlCallbackQueryDto } from './dto/callback.query.dto';
import { handleGhlOAuthCallback } from './ghl-oauth-callback.handler';
import { GhlService } from './ghl.service';

@Controller('integrations/ghl')
export class GhlController {
  constructor(private readonly ghl: GhlService) {}

  // Returns the URL the mobile app should open in an in-app browser session.
  // Caller must be authenticated AND have an active GHL subscription.
  @Get('auth-url')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  authUrl(@CurrentUser() user: AuthenticatedUser) {
    return this.ghl.buildAuthUrl(user.id);
  }

  // Legacy path — register GHL_REDIRECT_URI as /oauth/callback in Marketplace.
  @Get('callback')
  async callback(@Query() query: GhlCallbackQueryDto, @Res() res: Response) {
    await handleGhlOAuthCallback(this.ghl, query, res);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.ghl.getStatus(user.id);
  }

  @Post('disconnect')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  disconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.ghl.disconnect(user.id);
  }
}
