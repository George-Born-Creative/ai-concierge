import Constants from 'expo-constants';

export type RuntimeVersionDetails = {
  appVersion: string;
  buildVersion: string | null;
};

export function getRuntimeVersionDetails(): RuntimeVersionDetails {
  return {
    appVersion:
      Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? '1.0.0',
    buildVersion:
      Constants.nativeBuildVersion ??
      Constants.expoConfig?.ios?.buildNumber ??
      Constants.expoConfig?.android?.versionCode?.toString() ??
      null,
  };
}

export function getRuntimeVersion(): string {
  const { appVersion, buildVersion } = getRuntimeVersionDetails();

  return buildVersion
    ? `v${appVersion} (${buildVersion})`
    : `v${appVersion}`;
}
