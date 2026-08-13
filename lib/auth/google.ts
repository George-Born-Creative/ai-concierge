import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';

// Native Google Sign-In wrapper.
//
// The `@react-native-google-signin/google-signin` native module is only linked
// in dev/production client builds — not in Expo Go, and not on web. We
// lazy-`require` it (mirroring lib/push/*) so importing this file never crashes
// those environments; callers get a clear error instead.

type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin');

let cachedModule: GoogleSigninModule | null = null;
let moduleLoadAttempted = false;
let configured = false;

// Non-throwing probe for the native binary. The google-signin package calls
// `TurboModuleRegistry.getEnforcing('RNGoogleSignin')` at import time, which
// throws a redbox Invariant Violation when the module isn't in the build (e.g.
// a dev client built before the package was added). We check first with the
// non-enforcing lookups so we can fail gracefully instead of crashing.
function nativeModulePresent(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    if (TurboModuleRegistry?.get?.('RNGoogleSignin')) return true;
  } catch {
    // fall through to the legacy bridge check
  }
  return Boolean(NativeModules?.RNGoogleSignin);
}

function loadModule(): GoogleSigninModule | null {
  if (moduleLoadAttempted) return cachedModule;
  moduleLoadAttempted = true;
  if (!nativeModulePresent()) {
    cachedModule = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedModule = require('@react-native-google-signin/google-signin');
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

export class GoogleSignInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleSignInError';
  }
}

// True when the native module is present (a real dev/prod build on iOS/Android).
export function isGoogleSignInAvailable(): boolean {
  return Platform.OS !== 'web' && loadModule() !== null;
}

function ensureConfigured(mod: GoogleSigninModule): void {
  if (configured) return;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  if (!webClientId) {
    throw new GoogleSignInError(
      'Google sign-in is not configured (missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID).',
    );
  }
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  mod.GoogleSignin.configure({
    // The web client ID sets the returned id_token's `aud`, which must match
    // one of GOOGLE_CLIENT_IDS the backend verifies against.
    webClientId,
    ...(iosClientId ? { iosClientId } : {}),
    offlineAccess: false,
  });
  configured = true;
}

// Opens the native Google account picker and returns the ID token to POST to
// the backend, or `null` if the user dismissed the picker. Throws
// `GoogleSignInError` for genuine failures (misconfiguration, no Play Services,
// missing native module).
export async function signInWithGoogle(): Promise<string | null> {
  const mod = loadModule();
  if (!mod || Platform.OS === 'web') {
    throw new GoogleSignInError(
      'Google sign-in requires the native module. Rebuild the dev client — it is unavailable in Expo Go and on web.',
    );
  }

  ensureConfigured(mod);

  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = mod;

  try {
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }

    // Clear any cached account so the picker is always shown (best effort).
    try {
      await GoogleSignin.signOut();
    } catch {
      // no previous session; ignore
    }

    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      return null; // user cancelled
    }

    const { idToken } = response.data;
    if (!idToken) {
      throw new GoogleSignInError(
        'Google did not return an ID token. Verify the web client ID configuration.',
      );
    }
    return idToken;
  } catch (err) {
    if (isErrorWithCode(err)) {
      if (
        err.code === statusCodes.SIGN_IN_CANCELLED ||
        err.code === statusCodes.IN_PROGRESS
      ) {
        return null;
      }
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new GoogleSignInError(
          'Google Play Services is unavailable or needs updating.',
        );
      }
    }
    if (err instanceof GoogleSignInError) throw err;
    throw new GoogleSignInError(
      err instanceof Error ? err.message : 'Google sign-in failed.',
    );
  }
}
