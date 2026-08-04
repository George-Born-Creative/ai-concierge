import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Allowed values for the GHL conversation status filter. */
const CONVERSATION_STATUSES = ['all', 'read', 'unread', 'starred'] as const;

/** Allowed values for the GHL conversation sort-by field. */
const SORT_BY_OPTIONS = ['last_message_date', 'last_manual_message_date', 'score_profile'] as const;

/** Allowed sort directions. */
const SORT_DIRECTIONS = ['asc', 'desc'] as const;

export class ListConversationsQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  startAfterId?: string;

  /** Filter by conversation status: all, read, unread, or starred. */
  @IsOptional()
  @IsIn(CONVERSATION_STATUSES)
  status?: (typeof CONVERSATION_STATUSES)[number];

  /**
   * Filter by assigned GHL user ID(s).
   * Comma-separated for multiple users, or "unassigned" for unassigned conversations.
   */
  @IsOptional()
  @IsString()
  assignedTo?: string;

  /** Filter by follower GHL user ID(s), comma-separated. */
  @IsOptional()
  @IsString()
  followers?: string;

  /**
   * Filter by last message type.
   * e.g. "TYPE_INTERNAL_COMMENT" for internal chat conversations.
   */
  @IsOptional()
  @IsString()
  lastMessageType?: string;

  /** Sort field: last_message_date, last_manual_message_date, or score_profile. */
  @IsOptional()
  @IsIn(SORT_BY_OPTIONS)
  sortBy?: (typeof SORT_BY_OPTIONS)[number];

  /** Sort direction: asc or desc. */
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  sort?: (typeof SORT_DIRECTIONS)[number];
}
