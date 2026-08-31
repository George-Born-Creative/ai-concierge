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
import { RequireCrmPlan } from '../../../common/guards/require-crm-plan.decorator';
import { CrmProvider } from '@prisma/client';
import { HubspotCompaniesService } from './companies.service';
import {
  BatchArchiveHubspotCompaniesDto,
  BatchReadHubspotCompaniesDto,
  BatchUpdateHubspotCompaniesDto,
} from './dto/batch-companies.dto';
import { HubspotCompanyReadQueryDto } from './dto/company-read.query.dto';
import { CreateHubspotCompanyDto } from './dto/create-company.dto';
import { ListHubspotCompaniesQueryDto } from './dto/list-companies.query.dto';
import { SearchHubspotCompaniesQueryDto } from './dto/search-companies.query.dto';
import { UpdateHubspotCompanyDto } from './dto/update-company.dto';

@Controller('integrations/hubspot/companies')
@RequireCrmPlan(CrmProvider.HUBSPOT)
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

  @Get('recent')
  recent(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListHubspotCompaniesQueryDto,
  ) {
    return this.companies.listRecent(user.id, { limit: query.limit, after: query.after });
  }

  @Post('batch/read')
  batchRead(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: BatchReadHubspotCompaniesDto,
  ) {
    return this.companies.batchRead(user.id, body);
  }

  @Post('batch/update')
  batchUpdate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: BatchUpdateHubspotCompaniesDto,
  ) {
    return this.companies.batchUpdate(user.id, body.inputs);
  }

  @Post('batch/archive')
  @HttpCode(200)
  async batchArchive(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: BatchArchiveHubspotCompaniesDto,
  ) {
    await this.companies.batchArchive(user.id, body.ids);
    return { ids: body.ids, archived: true };
  }

  @Get(':id/detail')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: HubspotCompanyReadQueryDto,
  ) {
    return this.companies.getDetail(user.id, id, {
      idProperty: query.idProperty,
      properties: splitCsv(query.properties),
      propertiesWithHistory: splitCsv(query.propertiesWithHistory),
      associations: splitCsv(query.associations),
    });
  }

  @Get(':id')
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: HubspotCompanyReadQueryDto,
  ) {
    return this.companies.getById(user.id, id, query.idProperty);
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
    @Query() query: HubspotCompanyReadQueryDto,
    @Body() body: UpdateHubspotCompanyDto,
  ) {
    return this.companies.update(user.id, id, body, query.idProperty);
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

  @Put(':id/associations/:toObjectType/:toObjectId')
  associate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('toObjectType') toObjectType: string,
    @Param('toObjectId') toObjectId: string,
  ) {
    return this.companies.associate(user.id, id, toObjectType, toObjectId);
  }

  @Delete(':id/associations/:toObjectType/:toObjectId')
  disassociate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('toObjectType') toObjectType: string,
    @Param('toObjectId') toObjectId: string,
  ) {
    return this.companies.disassociate(user.id, id, toObjectType, toObjectId);
  }
}

function splitCsv(value?: string): string[] | undefined {
  if (!value) return undefined;
  const values = [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
  return values.length ? values : undefined;
}
