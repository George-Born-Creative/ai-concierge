import { CreateHubspotContactDto } from './create-contact.dto';

/**
 * Every field in `CreateHubspotContactDto` is already optional, so PATCH
 * reuses the same validation surface. Subclassing keeps it semantically
 * distinct in route signatures and lets us diverge later if needed.
 */
export class UpdateHubspotContactDto extends CreateHubspotContactDto {}
