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
import { CreateHubspotTicketDto } from './dto/create-ticket.dto';
import { ListHubspotTicketsQueryDto } from './dto/list-tickets.query.dto';
import { SearchHubspotTicketsQueryDto } from './dto/search-tickets.query.dto';
import { UpdateHubspotTicketDto } from './dto/update-ticket.dto';
import { HubspotTicketsService } from './tickets.service';

@Controller('integrations/hubspot/tickets')
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
    });
  }

  @Get(':id')
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.tickets.getById(user.id, id);
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
    @Body() body: UpdateHubspotTicketDto,
  ) {
    return this.tickets.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.tickets.delete(user.id, id);
    return { id, deleted: true };
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
