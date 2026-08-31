import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';

import { AuthenticatedUser, CurrentUser } from '../../../common/current-user.decorator';
import { ActiveSubscriptionGuard } from '../../../common/guards/active-subscription.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RequireCrmPlan } from '../../../common/guards/require-crm-plan.decorator';
import { CrmProvider } from '@prisma/client';
import { HubspotDealsService } from './deals.service';
import {
  BatchArchiveHubspotDealsDto,
  BatchReadHubspotDealsDto,
  BatchUpdateHubspotDealsDto,
} from './dto/batch-deals.dto';
import { CreateHubspotDealDto } from './dto/create-deal.dto';
import { HubspotDealReadQueryDto } from './dto/deal-read.query.dto';
import { ListHubspotDealsQueryDto } from './dto/list-deals.query.dto';
import { SearchHubspotDealsQueryDto } from './dto/search-deals.query.dto';
import { UpdateHubspotDealDto } from './dto/update-deal.dto';

@Controller('integrations/hubspot/deals')
@RequireCrmPlan(CrmProvider.HUBSPOT)
@UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
export class HubspotDealsController {
  constructor(private readonly deals: HubspotDealsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListHubspotDealsQueryDto) {
    return this.deals.list(user.id, { limit: query.limit, after: query.after });
  }

  @Get('search')
  search(@CurrentUser() user: AuthenticatedUser, @Query() query: SearchHubspotDealsQueryDto) {
    return this.deals.search(user.id, { q: query.q, limit: query.limit, after: query.after });
  }

  @Get('recent')
  recent(@CurrentUser() user: AuthenticatedUser, @Query() query: ListHubspotDealsQueryDto) {
    return this.deals.listRecent(user.id, { limit: query.limit, after: query.after });
  }

  @Get('pipelines')
  pipelines(@CurrentUser() user: AuthenticatedUser) {
    return this.deals.listPipelines(user.id);
  }

  @Post('batch/read')
  batchRead(@CurrentUser() user: AuthenticatedUser, @Body() body: BatchReadHubspotDealsDto) {
    return this.deals.batchRead(user.id, body);
  }

  @Post('batch/update')
  batchUpdate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: BatchUpdateHubspotDealsDto,
  ) {
    return this.deals.batchUpdate(user.id, body.inputs);
  }

  @Post('batch/archive')
  @HttpCode(200)
  async batchArchive(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: BatchArchiveHubspotDealsDto,
  ) {
    await this.deals.batchArchive(user.id, body.ids);
    return { ids: body.ids, archived: true };
  }

  @Get(':id/detail')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: HubspotDealReadQueryDto,
  ) {
    return this.deals.getDetail(user.id, id, {
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
    @Query() query: HubspotDealReadQueryDto,
  ) {
    return this.deals.getById(user.id, id, query.idProperty);
  }

  @Post()
  @HttpCode(201)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateHubspotDealDto) {
    return this.deals.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: HubspotDealReadQueryDto,
    @Body() body: UpdateHubspotDealDto,
  ) {
    return this.deals.update(user.id, id, body, query.idProperty);
  }

  @Delete(':id')
  @HttpCode(200)
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.deals.delete(user.id, id);
    return { id, deleted: true };
  }

  @Put(':id/associations/:toObjectType/:toObjectId')
  associate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('toObjectType') toObjectType: string,
    @Param('toObjectId') toObjectId: string,
  ) {
    return this.deals.associate(user.id, id, toObjectType, toObjectId);
  }

  @Delete(':id/associations/:toObjectType/:toObjectId')
  disassociate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('toObjectType') toObjectType: string,
    @Param('toObjectId') toObjectId: string,
  ) {
    return this.deals.disassociate(user.id, id, toObjectType, toObjectId);
  }
}

function splitCsv(value?: string): string[] | undefined {
  if (!value) return undefined;
  const values = [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
  return values.length ? values : undefined;
}
