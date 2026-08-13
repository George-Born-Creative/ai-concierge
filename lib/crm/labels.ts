import type { CrmProvider } from '@/lib/api/types';

/**
 * Display labels for every CRM the app knows about. ONE source of truth so
 * adding a future provider is a one-line change here — every UI string that
 * mentions the active CRM resolves through this map.
 *
 * Backend mirror lives at `backend/src/common/crm-labels.ts`; keep them in
 * sync when adding providers.
 */
export const CRM_LABELS: Record<CrmProvider, string> = {
  ghl: 'GoHighLevel',
  hubspot: 'HubSpot',
};

/** Ordered list of providers — drives the "GoHighLevel or HubSpot" copy. */
export const CRM_PROVIDERS: ReadonlyArray<CrmProvider> = ['ghl', 'hubspot'];

/**
 * Returns the human-readable label for a provider. When the caller doesn't
 * know which CRM is active (no integration / no plan), falls back to the
 * generic "your CRM" so copy never lies about the active integration.
 */
export function getCrmLabel(provider: CrmProvider | null | undefined): string {
  if (provider && CRM_LABELS[provider]) return CRM_LABELS[provider];
  return 'your CRM';
}

/**
 * "GoHighLevel or HubSpot" — used in onboarding, settings subtitles, and
 * any "pick a CRM" prompt. Adding a new provider to `CRM_LABELS` extends
 * the list automatically.
 */
export function getCrmLabelList(separator = ' or '): string {
  return CRM_PROVIDERS.map((p) => CRM_LABELS[p]).join(separator);
}
