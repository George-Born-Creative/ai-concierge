import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../common/current-user.decorator';
import { ActiveSubscriptionGuard } from '../../../common/guards/active-subscription.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CreateHubspotOrderDto } from './dto/create-order.dto';
import { ListHubspotOrdersQueryDto } from './dto/list-orders.query.dto';
import { SearchHubspotOrdersQueryDto } from './dto/search-orders.query.dto';
import { UpdateHubspotOrderDto } from './dto/update-order.dto';
import { HubspotOrdersService } from './orders.service';

@Controller('integrations/hubspot/orders')
@UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
export class HubspotOrdersController {
  constructor(private readonly orders: HubspotOrdersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListHubspotOrdersQueryDto,
  ) {
    return this.orders.list(user.id, {
      limit: query.limit,
      after: query.after,
    });
  }

  // Declared BEFORE `:id` so Nest matches the static `search` path first.
  @Get('search')
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchHubspotOrdersQueryDto,
  ) {
    return this.orders.search(user.id, {
      q: query.q,
      limit: query.limit,
      after: query.after,
    });
  }

  @Get(':id')
  getById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.getById(user.id, id);
  }

  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateHubspotOrderDto,
  ) {
    return this.orders.create(user.id, body);
  }

  @Patch(':id')
  @HttpCode(200)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateHubspotOrderDto,
  ) {
    return this.orders.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.orders.delete(user.id, id);
    return { id, deleted: true };
  }

  // ── Associations (Order ↔ Contact) ──────────────────────────────────────────

  @Put(':id/contacts/:contactId')
  @HttpCode(200)
  associateContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
  ) {
    return this.orders.associateContact(user.id, id, contactId);
  }

  @Delete(':id/contacts/:contactId')
  @HttpCode(200)
  disassociateContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
  ) {
    return this.orders.disassociateContact(user.id, id, contactId);
  }

  // ── Associations (Order ↔ Company) ───────────────────────────────────────────

  @Put(':id/companies/:companyId')
  @HttpCode(200)
  associateCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('companyId') companyId: string,
  ) {
    return this.orders.associateCompany(user.id, id, companyId);
  }

  @Delete(':id/companies/:companyId')
  @HttpCode(200)
  disassociateCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('companyId') companyId: string,
  ) {
    return this.orders.disassociateCompany(user.id, id, companyId);
  }

  // ── Associations (Order ↔ Deal) ──────────────────────────────────────────────

  @Put(':id/deals/:dealId')
  @HttpCode(200)
  associateDeal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('dealId') dealId: string,
  ) {
    return this.orders.associateDeal(user.id, id, dealId);
  }

  @Delete(':id/deals/:dealId')
  @HttpCode(200)
  disassociateDeal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('dealId') dealId: string,
  ) {
    return this.orders.disassociateDeal(user.id, id, dealId);
  }
}
