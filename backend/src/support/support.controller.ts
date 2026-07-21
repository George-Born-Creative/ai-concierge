import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { SupportService } from './support.service';

@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('requests')
  createRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSupportRequestDto,
  ) {
    return this.support.createRequest(user.id, dto);
  }
}
