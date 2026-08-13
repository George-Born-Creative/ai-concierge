import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Mirrors `HubspotTicketWriteInput` in the service. Property names are
 * camelCase so the REST surface matches the other HubSpot resources and the
 * frontend can use one shared form. The service translates to HubSpot's
 * lowercase property names (`hs_ticket_priority`, `hs_pipeline`, …) at the
 * API boundary.
 *
 * Every field is optional at the validation layer — the service rejects a
 * missing subject with `BadRequestException`, mirroring the companies flow.
 * That keeps create / update sharing the same DTO.
 */
export class CreateHubspotTicketDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: string;

  /** HubSpot pipeline id (e.g. `0` for the default support pipeline). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  pipeline?: string;

  /** HubSpot pipeline stage id (e.g. `1` for "New"). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  stage?: string;
}
