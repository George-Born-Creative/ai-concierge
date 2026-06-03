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
import { HubspotCompaniesService } from './companies.service';
import { CreateHubspotCompanyDto } from './dto/create-company.dto';
import { ListHubspotCompaniesQueryDto } from './dto/list-companies.query.dto';
import { SearchHubspotCompaniesQueryDto } from './dto/search-companies.query.dto';
import { UpdateHubspotCompanyDto } from './dto/update-company.dto';

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

  // Declared BEFORE `:id` so Nest matches the static `search` path first.
  @Get('search')
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchHubspotCompaniesQueryDto,
  ) {
    return this.companies.search(user.id, {
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
    return this.companies.getById(user.id, id);
  }

  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateHubspotCompanyDto,
  ) {
    return this.companies.create(user.id, body);
  }

  @Patch(':id')
  @HttpCode(200)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateHubspotCompanyDto,
  ) {
    return this.companies.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.companies.delete(user.id, id);
    return { id, deleted: true };
  }

  // ── Associations (Company ↔ Contact) ───────────────────────────────────────

  @Put(':id/contacts/:contactId')
  @HttpCode(200)
  associateContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
  ) {
    return this.companies.associateContact(user.id, id, contactId);
  }

  @Delete(':id/contacts/:contactId')
  @HttpCode(200)
  disassociateContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
  ) {
    return this.companies.disassociateContact(user.id, id, contactId);
  }

  // ── Associations (Company ↔ Deal) ──────────────────────────────────────────

  @Put(':id/deals/:dealId')
  @HttpCode(200)
  associateDeal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('dealId') dealId: string,
  ) {
    return this.companies.associateDeal(user.id, id, dealId);
  }

  @Delete(':id/deals/:dealId')
  @HttpCode(200)
  disassociateDeal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('dealId') dealId: string,
  ) {
    return this.companies.disassociateDeal(user.id, id, dealId);
  }
}
