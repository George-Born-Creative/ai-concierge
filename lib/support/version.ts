import Constants from 'expo-constants';

export function getRuntimeVersion(): string {
  const version =
    Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? '1.0.0';
  const build =
    Constants.nativeBuildVersion ??
    Constants.expoConfig?.ios?.buildNumber ??
    Constants.expoConfig?.android?.versionCode?.toString();

  return build ? `v${version} (${build})` : `v${version}`;
}
