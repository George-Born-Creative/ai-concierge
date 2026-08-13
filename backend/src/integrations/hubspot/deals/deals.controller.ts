import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../common/current-user.decorator';
import { ActiveSubscriptionGuard } from '../../../common/guards/active-subscription.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { HubspotDealsService } from './deals.service';
import { ListHubspotDealsQueryDto } from './dto/list-deals.query.dto';

@Controller('integrations/hubspot/deals')
@UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
export class HubspotDealsController {
  constructor(private readonly deals: HubspotDealsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListHubspotDealsQueryDto,
  ) {
    return this.deals.list(user.id, {
      limit: query.limit,
      after: query.after,
    });
  }

  @Get(':id')
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.deals.getById(user.id, id);
  }
}
