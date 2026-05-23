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
import { HubspotCallbackQueryDto } from './dto/callback.query.dto';
import { HubspotService } from './hubspot.service';

@Controller('integrations/hubspot')
export class HubspotController {
  constructor(private readonly hubspot: HubspotService) {}

  // Returns the URL the mobile app should open in an in-app browser session.
  // Caller must be authenticated AND have an active HubSpot subscription.
  @Get('auth-url')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  authUrl(@CurrentUser() user: AuthenticatedUser) {
    return this.hubspot.buildAuthUrl(user.id);
  }

  // PUBLIC: HubSpot redirects the browser here with ?code=...&state=...
  // We exchange the code, introspect for the portal id, store encrypted
  // tokens, then return an HTML page that deep-links into the mobile app
  // via the `aiconcierge://` scheme.
  @Get('callback')
  async callback(@Query() query: HubspotCallbackQueryDto, @Res() res: Response) {
    const scheme = this.hubspot.getDeepLinkScheme();

    if (query.error) {
      return this.sendDeepLink(res, scheme, 'error', query.error);
    }

    if (!query.code || !query.state) {
      return this.sendDeepLink(res, scheme, 'error', 'missing_code_or_state');
    }

    try {
      await this.hubspot.handleCallback(query.code, query.state);
      return this.sendDeepLink(res, scheme, 'ok');
    } catch (err) {
      const reason = (err as Error).message || 'token_exchange';
      return this.sendDeepLink(res, scheme, 'error', reason);
    }
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.hubspot.getStatus(user.id);
  }

  @Post('disconnect')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  disconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.hubspot.disconnect(user.id);
  }

  private sendDeepLink(res: Response, scheme: string, status: 'ok' | 'error', reason?: string) {
    const params = new URLSearchParams({ status });
    if (reason) params.set('reason', reason);
    const deepLink = `${scheme}://oauth/hubspot?${params.toString()}`;
    res.redirect(302, deepLink);
  }
}
