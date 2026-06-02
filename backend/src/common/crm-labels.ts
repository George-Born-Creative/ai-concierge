import { CrmProvider } from '@prisma/client';

/**
 * Display labels for every CRM the app knows about. ONE source of truth so a
 * future provider only needs to be added here — every assistant message,
 * frontend pill, and onboarding card resolves through this map.
 */
export const CRM_LABELS: Record<CrmProvider, string> = {
  [CrmProvider.GHL]: 'GoHighLevel',
  [CrmProvider.HUBSPOT]: 'HubSpot',
};

/**
 * Returns the human-readable label for a provider, or a CRM-agnostic
 * fallback when the caller doesn't know (e.g. user has no integration
 * connection yet). Use the fallback in cross-cutting messages so the copy
 * never lies about which CRM is active.
 */
export function crmLabel(provider: CrmProvider | null | undefined): string {
  if (provider && CRM_LABELS[provider]) return CRM_LABELS[provider];
  return 'your CRM';
}

/**
 * Inline list of all supported CRM labels, e.g. "GoHighLevel or HubSpot".
 * Used by no-provider error messages and the Switch-CRM settings copy so
 * adding a new provider expands every list automatically.
 */
export function crmLabelList(separator = ' or '): string {
  return Object.values(CRM_LABELS).join(separator);
}
