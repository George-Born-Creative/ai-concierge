import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { SupportDiagnosticsService } from './support-diagnostics.service';
import { SupportService } from './support.service';

@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly diagnostics: SupportDiagnosticsService,
  ) {}

  @Get('diagnostics')
  getDiagnostics(@CurrentUser() user: AuthenticatedUser) {
    return this.diagnostics.getDiagnostics(user.id);
  }

  @Post('requests')
  createRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSupportRequestDto,
  ) {
    return this.support.createRequest(user.id, dto);
  }
}
