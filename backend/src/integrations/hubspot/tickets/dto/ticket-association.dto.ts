import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class HubspotTicketAssociationQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) associationTypeId?: number;
  @IsOptional() @IsIn(['HUBSPOT_DEFINED', 'USER_DEFINED', 'INTEGRATOR_DEFINED'])
  associationCategory?: 'HUBSPOT_DEFINED' | 'USER_DEFINED' | 'INTEGRATOR_DEFINED';
}
