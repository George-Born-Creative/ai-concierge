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
import { CreateHubspotTicketDto } from './dto/create-ticket.dto';
import {
  BatchArchiveHubspotTicketsDto,
  BatchReadHubspotTicketsDto,
  BatchUpdateHubspotTicketsDto,
} from './dto/batch-tickets.dto';
import { ListHubspotTicketsQueryDto } from './dto/list-tickets.query.dto';
import { SearchHubspotTicketsQueryDto } from './dto/search-tickets.query.dto';
import { HubspotTicketAssociationQueryDto } from './dto/ticket-association.dto';
import { HubspotTicketReadQueryDto } from './dto/ticket-read.query.dto';
import { UpdateHubspotTicketDto } from './dto/update-ticket.dto';
import { HubspotTicketsService } from './tickets.service';

@Controller('integrations/hubspot/tickets')
@RequireCrmPlan(CrmProvider.HUBSPOT)
@UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
export class HubspotTicketsController {
  constructor(private readonly tickets: HubspotTicketsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListHubspotTicketsQueryDto,
  ) {
    return this.tickets.list(user.id, {
      limit: query.limit,
      after: query.after,
      archived: query.archived,
      properties: splitCsv(query.properties),
      propertiesWithHistory: splitCsv(query.propertiesWithHistory),
      associations: splitCsv(query.associations),
    });
  }

  // Declared BEFORE `:id` so Nest matches the static `search` path first.
  @Get('search')
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchHubspotTicketsQueryDto,
  ) {
    return this.tickets.search(user.id, {
      q: query.q,
      limit: query.limit,
      after: query.after,
      priority: query.priority,
      pipeline: query.pipeline,
      stage: query.stage,
      ownerId: query.ownerId,
      sort: query.sort,
    });
  }

  @Get('pipelines')
  pipelines(@CurrentUser() user: AuthenticatedUser) {
    return this.tickets.listPipelines(user.id);
  }

  @Get('properties')
  properties(@CurrentUser() user: AuthenticatedUser) {
    return this.tickets.listProperties(user.id);
  }

  @Post('batch/read')
  batchRead(@CurrentUser() user: AuthenticatedUser, @Body() body: BatchReadHubspotTicketsDto) {
    return this.tickets.batchRead(user.id, body);
  }

  @Post('batch/update')
  batchUpdate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: BatchUpdateHubspotTicketsDto,
  ) {
    return this.tickets.batchUpdate(user.id, body.inputs);
  }

  @Post('batch/archive')
  @HttpCode(200)
  async batchArchive(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: BatchArchiveHubspotTicketsDto,
  ) {
    await this.tickets.batchArchive(user.id, body.ids);
    return { ids: body.ids, archived: true };
  }

  @Get('associations/:toObjectType/labels')
  associationLabels(
    @CurrentUser() user: AuthenticatedUser,
    @Param('toObjectType') toObjectType: string,
  ) {
    return this.tickets.listAssociationLabels(user.id, toObjectType);
  }

  @Get(':id/detail')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: HubspotTicketReadQueryDto,
  ) {
    return this.tickets.getDetail(user.id, id, {
      idProperty: query.idProperty,
      archived: query.archived,
      properties: splitCsv(query.properties),
      propertiesWithHistory: splitCsv(query.propertiesWithHistory),
      associations: splitCsv(query.associations),
    });
  }

  @Get(':id')
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: HubspotTicketReadQueryDto,
  ) {
    return this.tickets.getById(user.id, id, query.idProperty);
  }

  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateHubspotTicketDto,
  ) {
    return this.tickets.create(user.id, body);
  }

  @Patch(':id')
  @HttpCode(200)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: HubspotTicketReadQueryDto,
    @Body() body: UpdateHubspotTicketDto,
  ) {
    return this.tickets.update(user.id, id, body, query.idProperty);
  }

  @Delete(':id')
  @HttpCode(200)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.tickets.archive(user.id, id);
    return { id, archived: true };
  }

  @Put(':id/associations/:toObjectType/:toObjectId')
  associate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('toObjectType') toObjectType: string,
    @Param('toObjectId') toObjectId: string,
    @Query() query: HubspotTicketAssociationQueryDto,
  ) {
    return this.tickets.associate(user.id, id, toObjectType, toObjectId, query.associationTypeId);
  }

  @Delete(':id/associations/:toObjectType/:toObjectId')
  disassociate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('toObjectType') toObjectType: string,
    @Param('toObjectId') toObjectId: string,
    @Query() query: HubspotTicketAssociationQueryDto,
  ) {
    return this.tickets.disassociate(
      user.id,
      id,
      toObjectType,
      toObjectId,
      query.associationTypeId,
    );
  }

  // ── Associations (Ticket ↔ Contact) ────────────────────────────────────────

  @Put(':id/contacts/:contactId')
  @HttpCode(200)
  associateContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
  ) {
    return this.tickets.associateContact(user.id, id, contactId);
  }

  @Delete(':id/contacts/:contactId')
  @HttpCode(200)
  disassociateContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
  ) {
    return this.tickets.disassociateContact(user.id, id, contactId);
  }

  // ── Associations (Ticket ↔ Company) ─────────────────────────────────────────

  @Put(':id/companies/:companyId')
  @HttpCode(200)
  associateCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('companyId') companyId: string,
  ) {
    return this.tickets.associateCompany(user.id, id, companyId);
  }

  @Delete(':id/companies/:companyId')
  @HttpCode(200)
  disassociateCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('companyId') companyId: string,
  ) {
    return this.tickets.disassociateCompany(user.id, id, companyId);
  }

  // ── Associations (Ticket ↔ Deal) ────────────────────────────────────────────

  @Put(':id/deals/:dealId')
  @HttpCode(200)
  associateDeal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('dealId') dealId: string,
  ) {
    return this.tickets.associateDeal(user.id, id, dealId);
  }

  @Delete(':id/deals/:dealId')
  @HttpCode(200)
  disassociateDeal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('dealId') dealId: string,
  ) {
    return this.tickets.disassociateDeal(user.id, id, dealId);
  }
}

function splitCsv(value?: string): string[] | undefined {
  if (!value) return undefined;
  const values = [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
  return values.length ? values : undefined;
}
