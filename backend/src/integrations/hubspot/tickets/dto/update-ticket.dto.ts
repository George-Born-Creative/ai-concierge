import { CreateHubspotTicketDto } from './create-ticket.dto';

/**
 * Every field in `CreateHubspotTicketDto` is already optional, so PATCH reuses
 * the same validation surface. Subclassing keeps it semantically distinct in
 * route signatures and lets us diverge later if needed — same convention as
 * `UpdateHubspotCompanyDto`.
 */
export class UpdateHubspotTicketDto extends CreateHubspotTicketDto {}
