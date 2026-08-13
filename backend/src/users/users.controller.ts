import { Body, Controller, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';

import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SetPushTokenDto } from './dto/set-push-token.dto';
import { SetTimezoneDto } from './dto/set-timezone.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post('me/push-token')
  @HttpCode(200)
  setPushToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetPushTokenDto,
  ) {
    return this.users.updatePushToken(user.id, dto.token);
  }

  @Patch('me/timezone')
  @HttpCode(200)
  setTimezone(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetTimezoneDto,
  ) {
    return this.users.updateTimezone(user.id, dto.timezone);
  }
}
