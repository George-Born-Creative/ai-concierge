import { CreateHubspotOrderDto } from './create-order.dto';

/**
 * Every field in `CreateHubspotOrderDto` is already optional, so PATCH reuses
 * the same validation surface. Subclassing keeps it semantically distinct in
 * route signatures and lets us diverge later if needed — same convention as
 * `UpdateHubspotTicketDto`.
 */
export class UpdateHubspotOrderDto extends CreateHubspotOrderDto {}
