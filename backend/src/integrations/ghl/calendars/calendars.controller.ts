import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../../../common/current-user.decorator';
import { ActiveSubscriptionGuard } from '../../../common/guards/active-subscription.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CalendarFreeSlotsQueryDto } from '../dto/calendar-free-slots.query.dto';
import { CreateGhlCalendarDto } from '../dto/create-calendar.dto';
import { UpdateGhlCalendarDto } from '../dto/update-calendar.dto';
import { CalendarsService } from './calendars.service';

@Controller('integrations/ghl')
export class CalendarsController {
  constructor(private readonly calendars: CalendarsService) {}

  @Get('calendars')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  listCalendars(@CurrentUser() user: AuthenticatedUser) { return this.calendars.listCalendars(user.id); }

  @Post('calendars')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  createCalendar(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateGhlCalendarDto) {
    return this.calendars.createCalendar(user.id, body);
  }

  @Get('calendars/:calendarId/free-slots')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getCalendarFreeSlots(@CurrentUser() user: AuthenticatedUser, @Param('calendarId') calendarId: string, @Query() query: CalendarFreeSlotsQueryDto) {
    return this.calendars.getCalendarFreeSlots(user.id, calendarId, query);
  }

  @Get('calendars/:calendarId')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getCalendar(@CurrentUser() user: AuthenticatedUser, @Param('calendarId') calendarId: string) {
    return this.calendars.getCalendar(user.id, calendarId);
  }

  @Put('calendars/:calendarId')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  updateCalendar(@CurrentUser() user: AuthenticatedUser, @Param('calendarId') calendarId: string, @Body() body: UpdateGhlCalendarDto) {
    return this.calendars.updateCalendar(user.id, calendarId, body);
  }

  @Delete('calendars/:calendarId')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  deleteCalendar(@CurrentUser() user: AuthenticatedUser, @Param('calendarId') calendarId: string) {
    return this.calendars.deleteCalendar(user.id, calendarId);
  }
}
