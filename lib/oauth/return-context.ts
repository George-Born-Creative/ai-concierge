/**
 * Remembers that an in-flight CRM OAuth session was started from Settings
 * so the deep-link landing can return there instead of the onboarding funnel.
 */
let pendingFrom: 'crm' | null = null;

export function setOAuthReturnFrom(from?: string | null): void {
  pendingFrom = from === 'crm' ? 'crm' : null;
}

export function consumeOAuthReturnFrom(): 'crm' | null {
  const value = pendingFrom;
  pendingFrom = null;
  return value;
}
