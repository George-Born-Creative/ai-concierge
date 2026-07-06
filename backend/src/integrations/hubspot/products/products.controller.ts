import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../common/current-user.decorator';
import { ActiveSubscriptionGuard } from '../../../common/guards/active-subscription.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CreateHubspotProductDto } from './dto/create-product.dto';
import { ListHubspotProductsQueryDto } from './dto/list-products.query.dto';
import { SearchHubspotProductsQueryDto } from './dto/search-products.query.dto';
import { UpdateHubspotProductDto } from './dto/update-product.dto';
import { HubspotProductsService } from './products.service';

@Controller('integrations/hubspot/products')
@UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
export class HubspotProductsController {
  constructor(private readonly products: HubspotProductsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListHubspotProductsQueryDto,
  ) {
    return this.products.list(user.id, {
      limit: query.limit,
      after: query.after,
    });
  }

  // Declared BEFORE `:id` so Nest matches the static `search` path first.
  @Get('search')
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchHubspotProductsQueryDto,
  ) {
    return this.products.search(user.id, {
      q: query.q,
      limit: query.limit,
      after: query.after,
    });
  }

  @Get(':id')
  getById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.products.getById(user.id, id);
  }

  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateHubspotProductDto,
  ) {
    return this.products.create(user.id, body);
  }

  @Patch(':id')
  @HttpCode(200)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateHubspotProductDto,
  ) {
    return this.products.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.products.delete(user.id, id);
    return { id, deleted: true };
  }
}
