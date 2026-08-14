import { IsIn, IsOptional } from 'class-validator';

import type { HubspotContactIdProperty } from '../contacts.service';

export class HubspotContactIdentifierQueryDto {
  @IsOptional()
  @IsIn(['id', 'email'])
  idProperty?: HubspotContactIdProperty;
}
