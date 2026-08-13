import { CreateHubspotCompanyDto } from './create-company.dto';

/**
 * Every field in `CreateHubspotCompanyDto` is already optional, so PATCH
 * reuses the same validation surface. Subclassing keeps it semantically
 * distinct in route signatures and lets us diverge later if needed —
 * same convention as `UpdateHubspotContactDto`.
 */
export class UpdateHubspotCompanyDto extends CreateHubspotCompanyDto {}
