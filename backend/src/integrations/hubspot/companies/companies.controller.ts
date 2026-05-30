import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../common/current-user.decorator';
import { ActiveSubscriptionGuard } from '../../../common/guards/active-subscription.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { HubspotCompaniesService } from './companies.service';
import { ListHubspotCompaniesQueryDto } from './dto/list-companies.query.dto';

@Controller('integrations/hubspot/companies')
@UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
export class HubspotCompaniesController {
  constructor(private readonly companies: HubspotCompaniesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListHubspotCompaniesQueryDto,
  ) {
    return this.companies.list(user.id, {
      limit: query.limit,
      after: query.after,
    });
  }

  @Get(':id')
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.companies.getById(user.id, id);
  }
}
