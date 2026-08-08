import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../../../common/current-user.decorator';
import { ActiveSubscriptionGuard } from '../../../common/guards/active-subscription.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CreateGhlAppointmentDto } from '../dto/create-appointment.dto';
import { ListCalendarEventsQueryDto } from '../dto/list-calendar-events.query.dto';
import { AppointmentsService } from './appointments.service';

@Controller('integrations/ghl')
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

  @Delete('calendar-events/:id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  cancelAppointment(@CurrentUser() user: AuthenticatedUser, @Param('id') eventId: string) {
    return this.appointments.cancelAppointment(user.id, eventId);
  }
}
