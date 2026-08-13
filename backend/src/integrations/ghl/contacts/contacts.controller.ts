import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../../../common/current-user.decorator';
import { ActiveSubscriptionGuard } from '../../../common/guards/active-subscription.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CreateGhlContactDto } from '../dto/create-contact.dto';
import { ListContactsQueryDto } from '../dto/list-contacts.query.dto';
import { SearchGhlContactsDto } from '../dto/search-contacts.dto';
import { UpdateGhlContactDto } from '../dto/update-contact.dto';
import { ContactsService } from './contacts.service';

@Controller('integrations/ghl')
@UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get('contacts')
  listContacts(@CurrentUser() user: AuthenticatedUser, @Query() query: ListContactsQueryDto) {
    return this.contacts.listContacts(
      user.id,
      query.limit ?? 10,
      query.query,
      query.page ?? 1,
    );
  }

  @Get('contacts/all')
  listAllContacts(@CurrentUser() user: AuthenticatedUser, @Query('query') query?: string) {
    return this.contacts.listAllContacts(user.id, query);
  }
  @Post('contacts/search')
  @HttpCode(200)
  searchContacts(@CurrentUser() user: AuthenticatedUser, @Body() body: SearchGhlContactsDto) {
    return this.contacts.searchContacts(user.id, body);
  }

  @Get('contacts/:id')
  getContact(@CurrentUser() user: AuthenticatedUser, @Param('id') contactId: string) {
    return this.contacts.getContact(user.id, contactId);
  }

  @Post('contacts')
  @HttpCode(200)
  createContact(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateGhlContactDto) {
    return this.contacts.createContact(user.id, body);
  }

  @Post('contacts/upsert')
  @HttpCode(200)
  upsertContact(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateGhlContactDto) {
    return this.contacts.upsertContact(user.id, body);
  }

  @Put('contacts/:id')
  @HttpCode(200)
  updateContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') contactId: string,
    @Body() body: UpdateGhlContactDto,
  ) {
    return this.contacts.updateContact(user.id, contactId, body);
  }

  @Delete('contacts/:id')
  @HttpCode(200)
  deleteContact(@CurrentUser() user: AuthenticatedUser, @Param('id') contactId: string) {
    return this.contacts.deleteContact(user.id, contactId);
  }
}
