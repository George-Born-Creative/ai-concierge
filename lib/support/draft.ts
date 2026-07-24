import { clearCacheItem, getCacheItem, setCacheItem } from '@/lib/cache';
import type { SupportRequestCategory } from '@/lib/api/types';

export type SupportRequestMode = 'support' | 'feedback';

export type SupportDraft = {
  clientRequestId: string;
  category: SupportRequestCategory | null;
  subject: string;
  description: string;
  includeDiagnostics: boolean;
  updatedAt: string;
};

type StoredSupportDraft = Omit<SupportDraft, 'includeDiagnostics'> & {
  includeDiagnostics?: unknown;
};

const DRAFT_PREFIX = 'support.request.draft.v1';
const SUPPORT_REQUEST_CATEGORIES = new Set<SupportRequestCategory>([
  'ACCOUNT',
  'BILLING',
  'CRM_GHL',
  'CRM_HUBSPOT',
  'OPENAI_ASSISTANT',
  'VOICE',
  'REMINDERS_NOTIFICATIONS',
  'CONNECTIVITY',
  'PRIVACY_SECURITY',
  'FEEDBACK',
  'OTHER',
]);

function draftKey(userId: string, mode: SupportRequestMode): string {
  return `${DRAFT_PREFIX}.${userId}.${mode}`;
}

function createClientRequestId(): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject?.randomUUID) return cryptoObject.randomUUID();

  if (cryptoObject?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoObject.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function freshDraft(mode: SupportRequestMode): SupportDraft {
  return {
    clientRequestId: createClientRequestId(),
    category: mode === 'feedback' ? 'FEEDBACK' : null,
    subject: '',
    description: '',
    includeDiagnostics: false,
    updatedAt: new Date().toISOString(),
  };
}

function isDraft(value: unknown): value is StoredSupportDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<SupportDraft>;
  return (
    typeof draft.clientRequestId === 'string' &&
    typeof draft.subject === 'string' &&
    typeof draft.description === 'string' &&
    typeof draft.updatedAt === 'string' &&
    (draft.category === null ||
      (typeof draft.category === 'string' &&
        SUPPORT_REQUEST_CATEGORIES.has(
          draft.category as SupportRequestCategory,
        )))
  );
}

export async function loadSupportDraft(
  userId: string,
  mode: SupportRequestMode,
): Promise<SupportDraft> {
  const raw = await getCacheItem(draftKey(userId, mode));
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isDraft(parsed)) {
        return {
          ...parsed,
          includeDiagnostics:
            typeof parsed.includeDiagnostics === 'boolean'
              ? parsed.includeDiagnostics
              : false,
        };
      }
    } catch {
      // Replace malformed local state with a clean draft.
    }
  }
  return freshDraft(mode);
}

export async function saveSupportDraft(
  userId: string,
  mode: SupportRequestMode,
  draft: SupportDraft,
): Promise<void> {
  await setCacheItem(
    draftKey(userId, mode),
    JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }),
  );
}

export async function clearSupportDraft(
  userId: string,
  mode?: SupportRequestMode,
): Promise<void> {
  if (mode) {
    await clearCacheItem(draftKey(userId, mode));
    return;
  }
  await Promise.all([
    clearCacheItem(draftKey(userId, 'support')),
    clearCacheItem(draftKey(userId, 'feedback')),
  ]);
}
