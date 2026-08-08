import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../../../common/current-user.decorator';
import { ActiveSubscriptionGuard } from '../../../common/guards/active-subscription.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CreateGhlContactDto } from '../dto/create-contact.dto';
import { ListContactsQueryDto } from '../dto/list-contacts.query.dto';
import { ContactsService } from './contacts.service';

@Controller('integrations/ghl')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get('contacts')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  listContacts(@CurrentUser() user: AuthenticatedUser, @Query() query: ListContactsQueryDto) {
    return this.contacts.listContacts(user.id, query.limit ?? 10, query.query);
  }

  @Post('contacts')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  createContact(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateGhlContactDto) {
    return this.contacts.createContact(user.id, body);
  }

  @Delete('contacts/:id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  deleteContact(@CurrentUser() user: AuthenticatedUser, @Param('id') contactId: string) {
    return this.contacts.deleteContact(user.id, contactId);
  }
}
