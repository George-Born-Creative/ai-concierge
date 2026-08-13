import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  type MessageEvent,
  Param,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { Observable } from 'rxjs';

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
  listConversations(
    @CurrentUser() user: AuthenticatedUser,
    @Query('tz') tz?: string,
  ) {
    return this.assistant.listConversations(user.id, tz);
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

  /**
   * SSE-streaming sibling of `runCommand`. The body is the same DTO; the
   * response is a Server-Sent Events stream of `phase` / `token` / `done`
   * events. The legacy JSON endpoint above is kept as a fallback for
   * clients that can't (or shouldn't) hold an open SSE connection.
   */
  @Post('conversations/:id/commands/stream')
  @Sse()
  runCommandStream(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: RunAssistantCommandDto,
  ): Observable<MessageEvent> {
    return this.assistant.runCommandStream(user.id, id, body);
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
