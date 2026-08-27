import { SetMetadata } from '@nestjs/common';
import { CrmProvider } from '@prisma/client';

export const REQUIRE_CRM_PLAN_KEY = 'requireCrmPlan';

/** Require an active/trialing subscription for this CRM's plan (ghl-pro / hubspot-pro). */
export const RequireCrmPlan = (provider: CrmProvider) =>
  SetMetadata(REQUIRE_CRM_PLAN_KEY, provider);
