import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../../../common/current-user.decorator';
import { ActiveSubscriptionGuard } from '../../../common/guards/active-subscription.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PipelinesService } from './pipelines.service';

@Controller('integrations/ghl')
export class PipelinesController {
  constructor(private readonly pipelines: PipelinesService) {}

  @Get('pipelines')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  listPipelines(@CurrentUser() user: AuthenticatedUser) { return this.pipelines.listPipelines(user.id); }
}
