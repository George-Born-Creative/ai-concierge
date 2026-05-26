import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { AuthenticatedUser, CurrentUser } from '../../common/current-user.decorator';
import { ActiveSubscriptionGuard } from '../../common/guards/active-subscription.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GhlCallbackQueryDto } from './dto/callback.query.dto';
import { CreateGhlContactDto } from './dto/create-contact.dto';
import { ListContactsQueryDto } from './dto/list-contacts.query.dto';
import {
  handleGhlOAuthCallback,
  handleGhlOAuthFinish,
} from './ghl-oauth-callback.handler';
import { GhlService } from './ghl.service';

@Controller('integrations/ghl')
export class GhlController {
  constructor(private readonly ghl: GhlService) {}

  /**
   * Returns the GHL authorize URL for the mobile in-app browser.
   * Query `returnUrl` must be the app deep link (e.g. aiconcierge://oauth/ghl).
   * After consent, GHL redirects to GHL_REDIRECT_URI → HTML calls GET /finish → deep link ?status=ok.
   */
  @Get('auth-url')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  authUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Query('returnUrl') returnUrl?: string,
  ) {
    return this.ghl.buildAuthUrl(user.id, returnUrl);
  }

  // Legacy path — same handler as GET /oauth/callback on the app root.
  @Get('callback')
  async callback(
    @Query() query: GhlCallbackQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const origin = `${req.protocol}://${req.get('host') ?? 'localhost:4000'}`;
    await handleGhlOAuthCallback(this.ghl, query, res, origin);
  }

  /** Called by the redirect page after load — exchanges code and saves tokens. */
  @Get('finish')
  async finish(@Query() query: GhlCallbackQueryDto) {
    return handleGhlOAuthFinish(this.ghl, query);
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

  @Get('contacts')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  listContacts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListContactsQueryDto,
  ) {
    return this.ghl.listContacts(user.id, query.limit ?? 10, query.query);
  }

  @Post('contacts')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  createContact(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateGhlContactDto,
  ) {
    return this.ghl.createContact(user.id, body);
  }

  @Delete('contacts/:id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  deleteContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') contactId: string,
  ) {
    return this.ghl.deleteContact(user.id, contactId);
  }
}
