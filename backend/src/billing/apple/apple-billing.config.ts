import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Environment } from '@apple/app-store-server-library';

// Apple's root certificate authority files. The JWS verifier needs these
// passed as Buffer[]; we read them from disk at boot. See apple-roots/README.md.
export const APPLE_ROOTS_DIR = 'src/billing/apple/apple-roots';

// Strongly-typed Apple IAP configuration parsed once on module init. Every
// env var is read here so the rest of the Apple module doesn't have to
// ConfigService-await on every request.
//
// Operating modes
//   "configured" → all required keys are present, the JWS verifier is
//                  initialised at boot, /billing/apple/* + /webhooks/apple
//                  perform real signature validation.
//   "disabled"   → one or more required keys are missing. The backend boots
//                  (so we never break the existing Stripe flow when an env
//                  forgets the Apple keys), but Apple endpoints return 503.
//
// Switching to "configured" without a redeploy: set the env vars and restart
// the service. We deliberately don't hot-reload — the SignedDataVerifier
// caches Apple's root certificates at construction time.
@Injectable()
export class AppleBillingConfig {
  private readonly logger = new Logger(AppleBillingConfig.name);

  readonly enabled: boolean;
  readonly bundleId: string;
  readonly teamId: string;
  readonly keyId: string;
  readonly privateKey: string;
  readonly environment: Environment;
  readonly notificationAudience: string;

  constructor(private readonly config: ConfigService) {
    const bundleId = this.config.get<string>('APPLE_BUNDLE_ID');
    const teamId = this.config.get<string>('APPLE_TEAM_ID');
    const keyId = this.config.get<string>('APPLE_KEY_ID');
    const rawKey = this.config.get<string>('APPLE_PRIVATE_KEY');
    const envName = this.config.get<string>('APPLE_ENV', 'Sandbox');
    const audience = this.config.get<string>('APPLE_NOTIFICATION_AUDIENCE');

    const missing = [
      ['APPLE_BUNDLE_ID', bundleId],
      ['APPLE_TEAM_ID', teamId],
      ['APPLE_KEY_ID', keyId],
      ['APPLE_PRIVATE_KEY', rawKey],
    ]
      .filter(([, v]) => !v || /replace_/.test(String(v)))
      .map(([k]) => k);

    if (missing.length > 0) {
      this.logger.warn(
        `Apple IAP disabled — missing/placeholder env vars: ${missing.join(', ')}`,
      );
      this.enabled = false;
      this.bundleId = '';
      this.teamId = '';
      this.keyId = '';
      this.privateKey = '';
      this.environment = Environment.SANDBOX;
      this.notificationAudience = '';
      return;
    }

    this.bundleId = bundleId!;
    this.teamId = teamId!;
    this.keyId = keyId!;
    // P8 keys are multi-line but env files only carry single-line values.
    // Allow either real newlines or escaped \n sequences in the env value
    // so the same .env works for dotenv, systemd, and shell exports.
    this.privateKey = rawKey!.replace(/\\n/g, '\n');
    this.environment = parseEnvironment(envName);
    this.notificationAudience = audience ?? bundleId!;
    this.enabled = true;
  }
}

function parseEnvironment(value: string): Environment {
  switch (value.trim().toLowerCase()) {
    case 'production':
    case 'prod':
      return Environment.PRODUCTION;
    case 'sandbox':
    case 'dev':
    case 'development':
    default:
      return Environment.SANDBOX;
  }
}
