import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../../../common/current-user.decorator';
import { ActiveSubscriptionGuard } from '../../../common/guards/active-subscription.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RequireCrmPlan } from '../../../common/guards/require-crm-plan.decorator';
import { CrmProvider } from '@prisma/client';
import { CreateGhlOpportunityDto } from '../dto/create-opportunity.dto';
import { ListGhlOpportunitiesQueryDto } from '../dto/list-opportunities.query.dto';
import { UpdateGhlOpportunityDto } from '../dto/update-opportunity.dto';
import { UpdateGhlOpportunityStatusDto } from '../dto/update-opportunity-status.dto';
import {
  AdvancedOpportunitySearchDto,
  OpportunityFollowersDto,
  RemoveOpportunityFollowersDto,
  UpsertGhlOpportunityDto,
} from '../dto/opportunity-v3.dto';
import { OpportunitiesService } from './opportunities.service';

@Controller('integrations/ghl')
@RequireCrmPlan(CrmProvider.GHL)
export class OpportunitiesController {
  constructor(private readonly opportunities: OpportunitiesService) {}

  @Get('opportunities')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  listOpportunities(@CurrentUser() user: AuthenticatedUser, @Query() query: ListGhlOpportunitiesQueryDto) {
    return this.opportunities.listOpportunities(user.id, query);
  }

  @Post('opportunities/search')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  searchOpportunities(@CurrentUser() user: AuthenticatedUser, @Body() body: AdvancedOpportunitySearchDto) {
    return this.opportunities.searchOpportunities(user.id, body);
  }

  @Post('opportunities/upsert')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  upsertOpportunity(@CurrentUser() user: AuthenticatedUser, @Body() body: UpsertGhlOpportunityDto) {
    return this.opportunities.upsertOpportunity(user.id, body);
  }

  @Get('opportunities/lost-reasons')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  listLostReasons(@CurrentUser() user: AuthenticatedUser) {
    return this.opportunities.listLostReasons(user.id);
  }

  @Post('opportunities')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  createOpportunity(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateGhlOpportunityDto) {
    return this.opportunities.createOpportunity(user.id, body);
  }

  @Put('opportunities/:id/status')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  updateOpportunityStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') opportunityId: string, @Body() body: UpdateGhlOpportunityStatusDto) {
    return this.opportunities.updateOpportunityStatus(user.id, opportunityId, body.status, body.lostReasonId);
  }

  @Post('opportunities/:id/followers')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  addOpportunityFollowers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') opportunityId: string,
    @Body() body: OpportunityFollowersDto,
  ) {
    return this.opportunities.addOpportunityFollowers(user.id, opportunityId, body.followers);
  }

  @Delete('opportunities/:id/followers')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  removeOpportunityFollowers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') opportunityId: string,
    @Body() body: RemoveOpportunityFollowersDto,
  ) {
    return this.opportunities.removeOpportunityFollowers(
      user.id,
      opportunityId,
      body.followers,
      body.removeAll,
    );
  }

  @Get('opportunities/:id')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getOpportunity(@CurrentUser() user: AuthenticatedUser, @Param('id') opportunityId: string) {
    return this.opportunities.getOpportunity(user.id, opportunityId);
  }

  @Put('opportunities/:id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  updateOpportunity(@CurrentUser() user: AuthenticatedUser, @Param('id') opportunityId: string, @Body() body: UpdateGhlOpportunityDto) {
    return this.opportunities.updateOpportunity(user.id, opportunityId, body);
  }

  @Delete('opportunities/:id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  deleteOpportunity(@CurrentUser() user: AuthenticatedUser, @Param('id') opportunityId: string) {
    return this.opportunities.deleteOpportunity(user.id, opportunityId);
  }
}
