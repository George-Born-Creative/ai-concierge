import { IsArray, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class SendMessageDto {
  /**
   * Message type / channel.
   * 'SMS' | 'Email' | 'InternalComment' | 'WhatsApp' | 'Live_Chat' | 'FB' | 'IG' | 'Custom'
   */
  @IsString()
  @IsIn([
    'SMS',
    'Email',
    'InternalComment',
    'WhatsApp',
    'Live_Chat',
    'FB',
    'IG',
    'Custom',
  ])
  type: 'SMS' | 'Email' | 'InternalComment' | 'WhatsApp' | 'Live_Chat' | 'FB' | 'IG' | 'Custom';

  /** Contact ID to send the message to (required if conversationId is omitted). */
  @IsOptional()
  @IsString()
  contactId?: string;

  /** Conversation ID to thread the message under (optional). */
  @IsOptional()
  @IsString()
  conversationId?: string;

  /** Message body text. */
  @IsString()
  @MinLength(1)
  message: string;

  /** Email subject (optional, used for Email type). */
  @IsOptional()
  @IsString()
  subject?: string;

  /** Email HTML content (optional, used for Email type). */
  @IsOptional()
  @IsString()
  html?: string;

  /** Optional file attachment URLs. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}
