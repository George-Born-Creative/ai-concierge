import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../common/current-user.decorator';
import { ActiveSubscriptionGuard } from '../../../common/guards/active-subscription.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { HubspotContactsService } from './contacts.service';
import { ListHubspotContactsQueryDto } from './dto/list-contacts.query.dto';
import { SearchHubspotContactsQueryDto } from './dto/search-contacts.query.dto';

@Controller('integrations/hubspot/contacts')
@UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
export class HubspotContactsController {
  constructor(private readonly contacts: HubspotContactsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListHubspotContactsQueryDto,
  ) {
    return this.contacts.list(user.id, {
      limit: query.limit,
      after: query.after,
    });
  }

  @Get('search')
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchHubspotContactsQueryDto,
  ) {
    return this.contacts.search(user.id, {
      q: query.q,
      limit: query.limit,
      after: query.after,
    });
  }

  @Get(':id')
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.contacts.getById(user.id, id);
  }
}
