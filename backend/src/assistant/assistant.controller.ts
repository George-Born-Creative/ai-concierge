import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { ActiveSubscriptionGuard } from '../common/guards/active-subscription.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AssistantService } from './assistant.service';
import { RunAssistantCommandDto } from './dto/run-command.dto';

@Controller('assistant')
@UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('conversations')
  listConversations(@CurrentUser() user: AuthenticatedUser) {
    return this.assistant.listConversations(user.id);
  }

  @Post('conversations')
  createConversation(@CurrentUser() user: AuthenticatedUser) {
    return this.assistant.createConversation(user.id);
  }

  @Delete('conversations')
  @HttpCode(200)
  clearConversations(@CurrentUser() user: AuthenticatedUser) {
    return this.assistant.clearConversations(user.id);
  }

  @Get('conversations/:id')
  getConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.assistant.getConversation(user.id, id);
  }

  @Delete('conversations/:id')
  @HttpCode(200)
  deleteConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.assistant.deleteConversation(user.id, id);
  }

  @Post('conversations/:id/commands')
  runCommand(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: RunAssistantCommandDto,
  ) {
    return this.assistant.runCommand(user.id, id, body);
  }

  @Delete('conversations/:conversationId/messages/:messageId')
  @HttpCode(200)
  deleteMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.assistant.deleteMessage(user.id, conversationId, messageId);
  }
}
