import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../../../common/current-user.decorator';
import { ActiveSubscriptionGuard } from '../../../common/guards/active-subscription.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CalendarFreeSlotsQueryDto } from '../dto/calendar-free-slots.query.dto';
import { CalendarV3PayloadDto, CalendarV3QueryDto } from '../dto/calendar-v3.dto';
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

  @Get('calendars/groups') @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  listGroups(@CurrentUser() user: AuthenticatedUser, @Query() query: CalendarV3QueryDto) { return this.calendars.listGroups(user.id, query); }
  @Post('calendars/groups') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  createGroup(@CurrentUser() user: AuthenticatedUser, @Body() body: CalendarV3PayloadDto) { return this.calendars.createGroup(user.id, body); }
  @Post('calendars/groups/validate-slug') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  validateGroupSlug(@CurrentUser() user: AuthenticatedUser, @Body() body: CalendarV3PayloadDto) { return this.calendars.validateGroupSlug(user.id, body); }
  @Put('calendars/groups/:id') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  updateGroup(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: CalendarV3PayloadDto) { return this.calendars.updateGroup(user.id, id, body); }
  @Put('calendars/groups/:id/status') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  setGroupStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: CalendarV3PayloadDto) { return this.calendars.setGroupStatus(user.id, id, body); }
  @Delete('calendars/groups/:id') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  deleteGroup(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.calendars.deleteGroup(user.id, id); }

  @Get('calendars/schedules') @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  listSchedules(@CurrentUser() user: AuthenticatedUser, @Query() query: CalendarV3QueryDto) { return this.calendars.listSchedules(user.id, query); }
  @Post('calendars/schedules') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  createSchedule(@CurrentUser() user: AuthenticatedUser, @Body() body: CalendarV3PayloadDto) { return this.calendars.createSchedule(user.id, body); }
  @Get('calendars/schedules/event-calendar/:calendarId') @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getEventSchedule(@CurrentUser() user: AuthenticatedUser, @Param('calendarId') id: string) { return this.calendars.getEventSchedule(user.id, id); }
  @Post('calendars/schedules/event-calendar/:calendarId') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  createEventSchedule(@CurrentUser() user: AuthenticatedUser, @Param('calendarId') id: string, @Body() body: CalendarV3PayloadDto) { return this.calendars.createEventSchedule(user.id, id, body); }
  @Put('calendars/schedules/event-calendar/:calendarId') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  updateEventSchedule(@CurrentUser() user: AuthenticatedUser, @Param('calendarId') id: string, @Body() body: CalendarV3PayloadDto) { return this.calendars.updateEventSchedule(user.id, id, body); }
  @Put('calendars/schedules/:id/associations/:calendarId') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  applySchedule(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('calendarId') calendarId: string) { return this.calendars.applySchedule(user.id, id, calendarId); }
  @Delete('calendars/schedules/:id/associations/:calendarId') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  removeSchedule(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('calendarId') calendarId: string) { return this.calendars.removeSchedule(user.id, id, calendarId); }
  @Get('calendars/schedules/:id') @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getSchedule(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.calendars.getSchedule(user.id, id); }
  @Put('calendars/schedules/:id') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  updateSchedule(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: CalendarV3PayloadDto) { return this.calendars.updateSchedule(user.id, id, body); }
  @Delete('calendars/schedules/:id') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  deleteSchedule(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.calendars.deleteSchedule(user.id, id); }

  @Get('calendars/services/locations') @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  listServiceLocations(@CurrentUser() user: AuthenticatedUser, @Query() query: CalendarV3QueryDto) { return this.calendars.listServiceLocations(user.id, query); }
  @Post('calendars/services/locations') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  createServiceLocation(@CurrentUser() user: AuthenticatedUser, @Body() body: CalendarV3PayloadDto) { return this.calendars.createServiceLocation(user.id, body); }
  @Get('calendars/services/locations/:id') @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getServiceLocation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.calendars.getServiceLocation(user.id, id); }
  @Put('calendars/services/locations/:id') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  updateServiceLocation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: CalendarV3PayloadDto) { return this.calendars.updateServiceLocation(user.id, id, body); }
  @Delete('calendars/services/locations/:id') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  deleteServiceLocation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.calendars.deleteServiceLocation(user.id, id); }

  @Get('calendars/services/bookings') @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  listServiceBookings(@CurrentUser() user: AuthenticatedUser, @Query() query: CalendarV3QueryDto) { return this.calendars.listServiceBookings(user.id, query); }
  @Post('calendars/services/bookings') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  createServiceBooking(@CurrentUser() user: AuthenticatedUser, @Body() body: CalendarV3PayloadDto) { return this.calendars.createServiceBooking(user.id, body); }
  @Get('calendars/services/bookings/:id') @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getServiceBooking(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.calendars.getServiceBooking(user.id, id); }
  @Put('calendars/services/bookings/:id') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  updateServiceBooking(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: CalendarV3PayloadDto) { return this.calendars.updateServiceBooking(user.id, id, body); }
  @Delete('calendars/services/bookings/:id') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  deleteServiceBooking(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.calendars.deleteServiceBooking(user.id, id); }

  @Get('calendars/services') @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  listServices(@CurrentUser() user: AuthenticatedUser, @Query() query: CalendarV3QueryDto) { return this.calendars.listServices(user.id, query); }
  @Post('calendars/services') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  createService(@CurrentUser() user: AuthenticatedUser, @Body() body: CalendarV3PayloadDto) { return this.calendars.createService(user.id, body); }
  @Get('calendars/services/:id') @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getService(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.calendars.getService(user.id, id); }
  @Put('calendars/services/:id') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  updateService(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: CalendarV3PayloadDto) { return this.calendars.updateService(user.id, id, body); }
  @Delete('calendars/services/:id') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  deleteService(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.calendars.deleteService(user.id, id); }

  @Get('calendars/:calendarId/notifications') @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  listNotifications(@CurrentUser() user: AuthenticatedUser, @Param('calendarId') id: string, @Query() query: CalendarV3QueryDto) { return this.calendars.listNotifications(user.id, id, query); }
  @Post('calendars/:calendarId/notifications') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  createNotifications(@CurrentUser() user: AuthenticatedUser, @Param('calendarId') id: string, @Body() body: CalendarV3PayloadDto) { return this.calendars.createNotifications(user.id, id, body); }
  @Get('calendars/:calendarId/notifications/:notificationId') @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getNotification(@CurrentUser() user: AuthenticatedUser, @Param('calendarId') id: string, @Param('notificationId') notificationId: string) { return this.calendars.getNotification(user.id, id, notificationId); }
  @Put('calendars/:calendarId/notifications/:notificationId') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  updateNotification(@CurrentUser() user: AuthenticatedUser, @Param('calendarId') id: string, @Param('notificationId') notificationId: string, @Body() body: CalendarV3PayloadDto) { return this.calendars.updateNotification(user.id, id, notificationId, body); }
  @Delete('calendars/:calendarId/notifications/:notificationId') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  deleteNotification(@CurrentUser() user: AuthenticatedUser, @Param('calendarId') id: string, @Param('notificationId') notificationId: string) { return this.calendars.deleteNotification(user.id, id, notificationId); }

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
