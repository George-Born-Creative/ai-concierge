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
  authUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Query('returnUrl') returnUrl?: string,
  ) {
    return this.hubspot.buildAuthUrl(user.id, returnUrl);
  }

  // PUBLIC: HubSpot redirects the browser here with ?code=...&state=...
  // We exchange the code, introspect for the portal id, store encrypted
  // tokens, then 302 into the mobile app via the deep-link baked into state.
  @Get('callback')
  async callback(@Query() query: HubspotCallbackQueryDto, @Res() res: Response) {
    const returnBase = query.state
      ? this.hubspot.resolveReturnUrl(query.state)
      : `${this.hubspot.getDeepLinkScheme()}://oauth/hubspot`;

    if (query.error) {
      return this.sendDeepLink(res, returnBase, 'error', query.error_description ?? query.error);
    }

    if (!query.code || !query.state) {
      return this.sendDeepLink(res, returnBase, 'error', 'missing_code_or_state');
    }

    try {
      const { returnUrl } = await this.hubspot.handleCallback(query.code, query.state);
      return this.sendDeepLink(res, returnUrl, 'ok');
    } catch (err) {
      const reason = (err as Error).message || 'token_exchange';
      return this.sendDeepLink(res, returnBase, 'error', reason);
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

  @Post('reconnect')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  reconnect(
    @CurrentUser() user: AuthenticatedUser,
    @Query('returnUrl') returnUrl?: string,
  ) {
    return this.hubspot.reconnect(user.id, returnUrl);
  }

  private sendDeepLink(
    res: Response,
    returnBase: string,
    status: 'ok' | 'error',
    reason?: string,
  ) {
    // If `returnBase` already carries query params (e.g. it came from an
    // earlier step that appended status), don't double-encode — just trust it.
    const hasStatus = returnBase.includes('status=');
    if (hasStatus) {
      res.redirect(302, returnBase);
      return;
    }
    const params = new URLSearchParams({ status });
    if (reason) params.set('reason', reason);
    const sep = returnBase.includes('?') ? '&' : '?';
    res.redirect(302, `${returnBase}${sep}${params.toString()}`);
  }
}
