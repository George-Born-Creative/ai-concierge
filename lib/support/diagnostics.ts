import NetInfo from '@react-native-community/netinfo';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { apiRequest } from '@/lib/api/client';
import { getApiBaseUrl } from '@/lib/api/base-url';
import type {
  ClientSupportDiagnostics,
  SupportDiagnosticGroup,
  SupportDiagnosticStatus,
} from '@/lib/api/types';
import { getPushState } from '@/lib/push/state';
import { getRuntimeVersionDetails } from '@/lib/support/version';

const UNKNOWN_VALUE = 'Unavailable';

/**
 * Collects only the explicitly allowlisted, coarse values used for support.
 * Keep this object literal explicit: adding a field requires a deliberate
 * client and server contract change.
 */
export async function collectClientSupportDiagnostics(): Promise<ClientSupportDiagnostics> {
  const [networkResult, apiResult] = await Promise.allSettled([
    NetInfo.fetch(),
    checkApiReachability(),
  ]);
  const network = networkResult.status === 'fulfilled' ? networkResult.value : null;
  const { appVersion, buildVersion } = getRuntimeVersionDetails();
  const localeOptions = getLocaleOptions();

  return {
    capturedAt: new Date().toISOString(),
    appVersion,
    buildVersion,
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    executionEnvironment: getExecutionEnvironment(),
    timezone: localeOptions.timezone,
    locale: localeOptions.locale,
    networkType: network?.type ?? UNKNOWN_VALUE,
    networkReachable: network?.isInternetReachable ?? null,
    pushStatus: getPushState().status ?? 'unknown',
    apiHost: getApiHostname(),
    apiReachable: apiResult.status === 'fulfilled' && apiResult.value,
  };
}

export function buildClientDiagnosticGroup(
  snapshot: ClientSupportDiagnostics,
): SupportDiagnosticGroup {
  return {
    key: 'app-device',
    label: 'App & device',
    items: [
      {
        key: 'app-version',
        label: 'App version',
        status: 'info',
        value: snapshot.buildVersion
          ? `${snapshot.appVersion} (${snapshot.buildVersion})`
          : snapshot.appVersion,
        detail: `${friendlyPlatform(snapshot.platform)} · OS ${snapshot.osVersion}`,
      },
      {
        key: 'runtime',
        label: 'App environment',
        status: 'info',
        value: snapshot.executionEnvironment,
        detail: `${snapshot.locale} · ${snapshot.timezone}`,
      },
      {
        key: 'network',
        label: 'Internet connection',
        status: reachabilityStatus(snapshot.networkReachable),
        value: reachabilityLabel(snapshot.networkReachable),
        detail: `Network type: ${friendlyValue(snapshot.networkType)}`,
      },
      {
        key: 'api',
        label: 'AI Concierge service',
        status: snapshot.apiReachable ? 'ok' : 'error',
        value: snapshot.apiReachable ? 'Reachable' : 'Unavailable',
        detail: `Host: ${friendlyValue(snapshot.apiHost)}`,
      },
      {
        key: 'push',
        label: 'Push notifications',
        status: pushStatus(snapshot.pushStatus),
        value: pushLabel(snapshot.pushStatus),
      },
    ],
  };
}

function getApiHostname(): string {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return UNKNOWN_VALUE;

  try {
    return new URL(baseUrl).hostname || UNKNOWN_VALUE;
  } catch {
    return UNKNOWN_VALUE;
  }
}

async function checkApiReachability(): Promise<boolean> {
  try {
    await apiRequest<unknown>('/health', { token: null });
    return true;
  } catch {
    return false;
  }
}

function getExecutionEnvironment(): string {
  const environment = Constants.executionEnvironment;
  if (environment) return String(environment);
  if (Constants.appOwnership) return String(Constants.appOwnership);
  return UNKNOWN_VALUE;
}

function getLocaleOptions(): { locale: string; timezone: string } {
  try {
    const options = Intl.DateTimeFormat().resolvedOptions();
    return {
      locale: options.locale || UNKNOWN_VALUE,
      timezone: options.timeZone || UNKNOWN_VALUE,
    };
  } catch {
    return { locale: UNKNOWN_VALUE, timezone: UNKNOWN_VALUE };
  }
}

function reachabilityStatus(value: boolean | null): SupportDiagnosticStatus {
  if (value === true) return 'ok';
  if (value === false) return 'error';
  return 'warning';
}

function reachabilityLabel(value: boolean | null): string {
  if (value === true) return 'Connected';
  if (value === false) return 'Unavailable';
  return 'Could not confirm';
}

function pushStatus(
  status: ClientSupportDiagnostics['pushStatus'],
): SupportDiagnosticStatus {
  if (status === 'granted') return 'ok';
  if (status === 'denied' || status === 'error') return 'warning';
  return 'info';
}

function pushLabel(status: ClientSupportDiagnostics['pushStatus']): string {
  switch (status) {
    case 'granted':
      return 'Allowed';
    case 'denied':
      return 'Turned off';
    case 'not_a_device':
      return 'Simulator or emulator';
    case 'no_project_id':
      return 'Not configured';
    case 'error':
      return 'Could not confirm';
    case 'web':
      return 'Web session';
    case 'expo_go':
      return 'Expo Go';
    case 'unknown':
      return 'Not checked yet';
  }
}

function friendlyPlatform(platform: ClientSupportDiagnostics['platform']): string {
  if (platform === 'ios') return 'iOS';
  if (platform === 'macos') return 'macOS';
  if (platform === 'web') return 'Web';
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

function friendlyValue(value: string): string {
  if (!value || value === UNKNOWN_VALUE) return UNKNOWN_VALUE;
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
