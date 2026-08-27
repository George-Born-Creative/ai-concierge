import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../../../common/current-user.decorator';
import { ActiveSubscriptionGuard } from '../../../common/guards/active-subscription.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RequireCrmPlan } from '../../../common/guards/require-crm-plan.decorator';
import { CrmProvider } from '@prisma/client';
import { CreateGhlAppointmentDto } from '../dto/create-appointment.dto';
import { AppointmentNoteDto, BlockSlotDto, CalendarV3QueryDto, UpdateAppointmentDto } from '../dto/calendar-v3.dto';
import { ListCalendarEventsQueryDto } from '../dto/list-calendar-events.query.dto';
import { AppointmentsService } from './appointments.service';

@Controller('integrations/ghl')
@RequireCrmPlan(CrmProvider.GHL)
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get('calendar-events')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  listCalendarEvents(@CurrentUser() user: AuthenticatedUser, @Query() query: ListCalendarEventsQueryDto) {
    return this.appointments.listCalendarEvents(user.id, query);
  }

  @Post('calendar-events')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  createAppointment(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateGhlAppointmentDto) {
    return this.appointments.createAppointment(user.id, body);
  }

  @Get('calendar-events/blocked-slots') @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  listBlockedSlots(@CurrentUser() user: AuthenticatedUser, @Query() query: CalendarV3QueryDto) { return this.appointments.listBlockedSlots(user.id, query); }
  @Post('calendar-events/blocked-slots') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  createBlockSlot(@CurrentUser() user: AuthenticatedUser, @Body() body: BlockSlotDto) { return this.appointments.createBlockSlot(user.id, body); }
  @Put('calendar-events/blocked-slots/:id') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  updateBlockSlot(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: BlockSlotDto) { return this.appointments.updateBlockSlot(user.id, id, body); }

  @Get('calendar-events/:appointmentId/notes') @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  listNotes(@CurrentUser() user: AuthenticatedUser, @Param('appointmentId') id: string) { return this.appointments.listNotes(user.id, id); }
  @Post('calendar-events/:appointmentId/notes') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  createNote(@CurrentUser() user: AuthenticatedUser, @Param('appointmentId') id: string, @Body() body: AppointmentNoteDto) { return this.appointments.createNote(user.id, id, body); }
  @Put('calendar-events/:appointmentId/notes/:noteId') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  updateNote(@CurrentUser() user: AuthenticatedUser, @Param('appointmentId') id: string, @Param('noteId') noteId: string, @Body() body: AppointmentNoteDto) { return this.appointments.updateNote(user.id, id, noteId, body); }
  @Delete('calendar-events/:appointmentId/notes/:noteId') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  deleteNote(@CurrentUser() user: AuthenticatedUser, @Param('appointmentId') id: string, @Param('noteId') noteId: string) { return this.appointments.deleteNote(user.id, id, noteId); }

  @Get('calendar-events/:id') @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getAppointment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.appointments.getAppointment(user.id, id); }
  @Put('calendar-events/:id') @HttpCode(200) @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  updateAppointment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: UpdateAppointmentDto) { return this.appointments.updateAppointment(user.id, id, body); }

  @Delete('calendar-events/:id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  cancelAppointment(@CurrentUser() user: AuthenticatedUser, @Param('id') eventId: string) {
    return this.appointments.cancelAppointment(user.id, eventId);
  }
}
