import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../../../common/current-user.decorator';
import { ActiveSubscriptionGuard } from '../../../common/guards/active-subscription.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RequireCrmPlan } from '../../../common/guards/require-crm-plan.decorator';
import { CrmProvider } from '@prisma/client';
import { ListConversationMessagesQueryDto } from './dto/list-conversation-messages.query.dto';
import { ListConversationsQueryDto } from './dto/list-conversations.query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { ConversationsService } from './conversations.service';

@Controller('integrations/ghl')
@RequireCrmPlan(CrmProvider.GHL)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get('conversations')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  listConversations(@CurrentUser() user: AuthenticatedUser, @Query() query: ListConversationsQueryDto) {
    return this.conversations.searchConversations(user.id, query);
  }

  @Get('conversations/ghl-user-id')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getGhlUserId(@CurrentUser() user: AuthenticatedUser) { return this.conversations.getGhlUserId(user.id); }

  @Get('conversations/:id')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getConversation(@CurrentUser() user: AuthenticatedUser, @Param('id') conversationId: string) {
    return this.conversations.getConversation(user.id, conversationId);
  }

  @Put('conversations/:id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  updateConversation(@CurrentUser() user: AuthenticatedUser, @Param('id') conversationId: string, @Body() body: UpdateConversationDto) {
    return this.conversations.updateConversation(user.id, conversationId, body);
  }

  @Get('conversations/:id/messages')
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  getConversationMessages(@CurrentUser() user: AuthenticatedUser, @Param('id') conversationId: string, @Query() query: ListConversationMessagesQueryDto) {
    return this.conversations.getMessages(user.id, conversationId, query);
  }

  @Post('conversations/messages')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  sendMessage(@CurrentUser() user: AuthenticatedUser, @Body() body: SendMessageDto) {
    return this.conversations.sendMessage(user.id, body);
  }

  @Post('conversations')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
  createConversation(@CurrentUser() user: AuthenticatedUser, @Body('contactId') contactId: string) {
    return this.conversations.createConversation(user.id, contactId);
  }
}
