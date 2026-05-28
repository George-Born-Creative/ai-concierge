import { IsEnum, IsOptional, IsString } from 'class-validator';

import type { GhlOpportunityStatus } from './create-opportunity.dto';

export class UpdateGhlOpportunityStatusDto {
  @IsEnum(['open', 'won', 'lost', 'abandoned'])
  status!: GhlOpportunityStatus;

  /** Required by GHL when `status === 'lost'`; mirrors SDK's lostReasonId. */
  @IsOptional()
  @IsString()
  lostReasonId?: string;
}
