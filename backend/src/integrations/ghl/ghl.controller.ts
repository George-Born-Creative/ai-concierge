import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
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
import { CalendarFreeSlotsQueryDto } from './dto/calendar-free-slots.query.dto';
import { CreateGhlAppointmentDto } from './dto/create-appointment.dto';
import { CreateGhlCalendarDto } from './dto/create-calendar.dto';
import { CreateGhlOpportunityDto } from './dto/create-opportunity.dto';
import { ListCalendarEventsQueryDto } from './dto/list-calendar-events.query.dto';
import { ListGhlOpportunitiesQueryDto } from './dto/list-opportunities.query.dto';
import { UpdateGhlCalendarDto } from './dto/update-calendar.dto';
import { UpdateGhlOpportunityDto } from './dto/update-opportunity.dto';
import { UpdateGhlOpportunityStatusDto } from './dto/update-opportunity-status.dto';
import { ListContactsQueryDto } from './dto/list-contacts.query.dto';
import {
  handleGhlOAuthCallback,
  handleGhlOAuthFinish,
} from './ghl-oauth-callback.handler';
import { GhlService } from './ghl.service';
import { GhlConversationsService } from './conversations/ghl-conversations.service';
import { ListConversationsQueryDto } from './conversations/dto/list-conversations.query.dto';
import { ListConversationMessagesQueryDto } from './conversations/dto/list-conversation-messages.query.dto';

@Controller('integrations/ghl')
export class GhlController {
  constructor(
    private readonly ghl: GhlService,
    private readonly ghlConversations: GhlConversationsService,
  ) {}

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

  @Post('reconnect')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  reconnect(
    @CurrentUser() user: AuthenticatedUser,
    @Query('returnUrl') returnUrl?: string,
  ) {
    return this.ghl.reconnect(user.id, returnUrl);
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

  @Get('calendars')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  listCalendars(@CurrentUser() user: AuthenticatedUser) {
    return this.ghl.listCalendars(user.id);
  }

  @Post('calendars')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  createCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateGhlCalendarDto,
  ) {
    return this.ghl.createCalendar(user.id, body);
  }

  @Get('calendars/:calendarId/free-slots')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getCalendarFreeSlots(
    @CurrentUser() user: AuthenticatedUser,
    @Param('calendarId') calendarId: string,
    @Query() query: CalendarFreeSlotsQueryDto,
  ) {
    return this.ghl.getCalendarFreeSlots(user.id, calendarId, query);
  }

  @Get('calendars/:calendarId')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('calendarId') calendarId: string,
  ) {
    return this.ghl.getCalendar(user.id, calendarId);
  }

  @Put('calendars/:calendarId')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  updateCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('calendarId') calendarId: string,
    @Body() body: UpdateGhlCalendarDto,
  ) {
    return this.ghl.updateCalendar(user.id, calendarId, body);
  }

  @Delete('calendars/:calendarId')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  deleteCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('calendarId') calendarId: string,
  ) {
    return this.ghl.deleteCalendar(user.id, calendarId);
  }

  @Get('calendar-events')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  listCalendarEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCalendarEventsQueryDto,
  ) {
    return this.ghl.listCalendarEvents(user.id, query);
  }

  @Post('calendar-events')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  createAppointment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateGhlAppointmentDto,
  ) {
    return this.ghl.createAppointment(user.id, body);
  }

  @Delete('calendar-events/:id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  cancelAppointment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') eventId: string,
  ) {
    return this.ghl.cancelAppointment(user.id, eventId);
  }

  @Get('pipelines')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  listPipelines(@CurrentUser() user: AuthenticatedUser) {
    return this.ghl.listPipelines(user.id);
  }

  @Get('opportunities')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  listOpportunities(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListGhlOpportunitiesQueryDto,
  ) {
    return this.ghl.listOpportunities(user.id, query);
  }

  @Post('opportunities')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  createOpportunity(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateGhlOpportunityDto,
  ) {
    return this.ghl.createOpportunity(user.id, body);
  }

  @Put('opportunities/:id/status')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  updateOpportunityStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') opportunityId: string,
    @Body() body: UpdateGhlOpportunityStatusDto,
  ) {
    return this.ghl.updateOpportunityStatus(
      user.id,
      opportunityId,
      body.status,
      body.lostReasonId,
    );
  }

  @Get('opportunities/:id')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getOpportunity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') opportunityId: string,
  ) {
    return this.ghl.getOpportunity(user.id, opportunityId);
  }

  @Put('opportunities/:id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  updateOpportunity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') opportunityId: string,
    @Body() body: UpdateGhlOpportunityDto,
  ) {
    return this.ghl.updateOpportunity(user.id, opportunityId, body);
  }

  @Delete('opportunities/:id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  deleteOpportunity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') opportunityId: string,
  ) {
    return this.ghl.deleteOpportunity(user.id, opportunityId);
  }

  @Get('conversations')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  listConversations(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListConversationsQueryDto,
  ) {
    return this.ghlConversations.searchConversations(user.id, query);
  }

  @Get('conversations/:id')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') conversationId: string,
  ) {
    return this.ghlConversations.getConversation(user.id, conversationId);
  }

  @Get('conversations/:id/messages')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getConversationMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') conversationId: string,
    @Query() query: ListConversationMessagesQueryDto,
  ) {
    return this.ghlConversations.getMessages(user.id, conversationId, query);
  }
}
