import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../../../common/current-user.decorator';
import { ActiveSubscriptionGuard } from '../../../common/guards/active-subscription.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CreateGhlPipelineDto, DeleteGhlPipelineQueryDto, UpdateGhlPipelineDto } from '../dto/pipeline.dto';
import { PipelinesService } from './pipelines.service';

@Controller('integrations/ghl')
export class PipelinesController {
  constructor(private readonly pipelines: PipelinesService) {}

  @Get('pipelines')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  listPipelines(@CurrentUser() user: AuthenticatedUser) { return this.pipelines.listPipelines(user.id); }

  @Post('pipelines')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  createPipeline(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateGhlPipelineDto) {
    return this.pipelines.createPipeline(user.id, body);
  }

  @Get('pipelines/:id')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getPipeline(@CurrentUser() user: AuthenticatedUser, @Param('id') pipelineId: string) {
    return this.pipelines.getPipeline(user.id, pipelineId);
  }

  @Put('pipelines/:id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  updatePipeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') pipelineId: string,
    @Body() body: UpdateGhlPipelineDto,
  ) {
    return this.pipelines.updatePipeline(user.id, pipelineId, body);
  }

  @Delete('pipelines/:id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  deletePipeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') pipelineId: string,
    @Query() query: DeleteGhlPipelineQueryDto,
  ) {
    if (!query.confirm) {
      throw new BadRequestException(
        'Deleting a pipeline also permanently deletes its opportunities; set confirm=true',
      );
    }
    return this.pipelines.deletePipeline(user.id, pipelineId);
  }
}
