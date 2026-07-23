export const SUPPORT_DIAGNOSTIC_STATUSES = [
  'ok',
  'warning',
  'error',
  'info',
] as const;

export type SupportDiagnosticStatus =
  (typeof SUPPORT_DIAGNOSTIC_STATUSES)[number];

export const CLIENT_DIAGNOSTIC_PLATFORMS = [
  'ios',
  'android',
  'web',
  'windows',
  'macos',
  'unknown',
] as const;

export const CLIENT_PUSH_STATUSES = [
  'granted',
  'denied',
  'not_a_device',
  'no_project_id',
  'error',
  'web',
  'expo_go',
  'unknown',
] as const;

export type ClientSupportDiagnostics = {
  capturedAt: string;
  appVersion: string;
  buildVersion: string | null;
  platform: (typeof CLIENT_DIAGNOSTIC_PLATFORMS)[number];
  osVersion: string;
  executionEnvironment: string;
  timezone: string;
  locale: string;
  networkType: string;
  networkReachable: boolean | null;
  pushStatus: (typeof CLIENT_PUSH_STATUSES)[number];
  apiHost: string;
  apiReachable: boolean;
};

export type SupportDiagnosticItem = {
  key: string;
  label: string;
  status: SupportDiagnosticStatus;
  value: string;
  detail?: string;
};

export type SupportDiagnosticGroup = {
  key: string;
  label: string;
  items: SupportDiagnosticItem[];
};

export type SupportDiagnosticsResponse = {
  generatedAt: string;
  groups: SupportDiagnosticGroup[];
};

export type StoredSupportDiagnostics = {
  version: 1;
  capturedAt: string;
  client: ClientSupportDiagnostics | null;
  server: SupportDiagnosticsResponse;
};

const STRING_LIMITS: Record<
  keyof Pick<
    ClientSupportDiagnostics,
    | 'capturedAt'
    | 'appVersion'
    | 'buildVersion'
    | 'osVersion'
    | 'executionEnvironment'
    | 'timezone'
    | 'locale'
    | 'networkType'
    | 'apiHost'
  >,
  number
> = {
  capturedAt: 40,
  appVersion: 50,
  buildVersion: 50,
  osVersion: 50,
  executionEnvironment: 50,
  timezone: 100,
  locale: 35,
  networkType: 30,
  apiHost: 255,
};

function boundedString(
  value: unknown,
  limit: number,
  fallback = 'unknown',
): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, limit) : fallback;
}

function safeApiHost(value: unknown): string {
  const raw = boundedString(value, STRING_LIMITS.apiHost);
  if (raw === 'unknown') return raw;
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const host = parsed.host;
    return /^[A-Za-z0-9.\-:[\]]+$/.test(host) ? host : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * The single persistence boundary for client-supplied diagnostics. Deliberately
 * copies known scalar fields instead of spreading input so future client data,
 * secrets, record content, and raw errors cannot enter the stored snapshot.
 */
export function sanitizeClientDiagnostics(
  input: unknown,
): ClientSupportDiagnostics | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;

  const platform = CLIENT_DIAGNOSTIC_PLATFORMS.includes(
    value.platform as (typeof CLIENT_DIAGNOSTIC_PLATFORMS)[number],
  )
    ? (value.platform as ClientSupportDiagnostics['platform'])
    : 'unknown';
  const pushStatus = CLIENT_PUSH_STATUSES.includes(
    value.pushStatus as (typeof CLIENT_PUSH_STATUSES)[number],
  )
    ? (value.pushStatus as ClientSupportDiagnostics['pushStatus'])
    : 'unknown';

  const rawBuildVersion = value.buildVersion;
  const buildVersion =
    rawBuildVersion === null || rawBuildVersion === undefined
      ? null
      : boundedString(rawBuildVersion, STRING_LIMITS.buildVersion);

  return {
    capturedAt: boundedString(value.capturedAt, STRING_LIMITS.capturedAt),
    appVersion: boundedString(value.appVersion, STRING_LIMITS.appVersion),
    buildVersion,
    platform,
    osVersion: boundedString(value.osVersion, STRING_LIMITS.osVersion),
    executionEnvironment: boundedString(
      value.executionEnvironment,
      STRING_LIMITS.executionEnvironment,
    ),
    timezone: boundedString(value.timezone, STRING_LIMITS.timezone),
    locale: boundedString(value.locale, STRING_LIMITS.locale),
    networkType: boundedString(value.networkType, STRING_LIMITS.networkType),
    networkReachable:
      typeof value.networkReachable === 'boolean'
        ? value.networkReachable
        : null,
    pushStatus,
    apiHost: safeApiHost(value.apiHost),
    apiReachable: value.apiReachable === true,
  };
}
