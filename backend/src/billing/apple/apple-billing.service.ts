import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import {
  Environment,
  NotificationTypeV2,
  ResponseBodyV2DecodedPayload,
  SignedDataVerifier,
  Subtype,
  JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PaymentProvider, SubscriptionStatus } from '@prisma/client';

import { PlansService } from '../../plans/plans.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from '../billing.service';
import { APPLE_ROOTS_DIR, AppleBillingConfig } from './apple-billing.config';

// Output of verifyAndUpsert returned to the mobile client. paymentProvider is
// always APPLE here (mobile branches on this for the "manage in App Store"
// affordance), and the local Subscription row is created/updated as a side
// effect — the mobile app doesn't need anything from the row, just a 2xx.
export type AppleVerifyResult = {
  paymentProvider: 'apple';
  status: SubscriptionStatus;
  planCode: string;
  expiresAt: string | null;
};

@Injectable()
export class AppleBillingService {
  private readonly logger = new Logger(AppleBillingService.name);
  private verifier: SignedDataVerifier | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly config: AppleBillingConfig,
    private readonly billing: BillingService,
  ) {
    if (this.config.enabled) {
      try {
        this.verifier = this.buildVerifier();
        this.logger.log(
          `Apple IAP verifier initialised (env=${envName(this.config.environment)}, bundle=${this.config.bundleId})`,
        );
      } catch (err) {
        this.logger.warn(
          `Apple IAP disabled — failed to initialise SignedDataVerifier: ${(err as Error).message}`,
        );
        this.verifier = null;
      }
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  // Verifies the JWS signedTransactionInfo coming from the mobile client
  // (StoreKit 2 → expo-iap) and writes a Subscription row keyed by userId
  // with paymentProvider=APPLE. Used by both POST /billing/apple/verify
  // (first purchase) and POST /billing/apple/restore (Restore Purchases).
  //
  // Validation we own (Apple's SDK only validates signature + bundle):
  //   - the productId from the JWS must match the plan the client claims it
  //     bought, and that plan must have appleProductId set (Step 1 seeded
  //     ghl-pro / hubspot-pro);
  //   - the originalTransactionId must not belong to a different user — App
  //     Store accounts can't be repurposed across our user IDs.
  //
  // If the user previously had a Stripe sub on a different plan, we cancel
  // the Stripe one and drop the related CRM integration before writing the
  // Apple sub (CRM switch, identical behaviour to Stripe → Stripe).
  async verifyAndUpsert(
    userId: string,
    planCode: string,
    jwsRepresentation: string,
  ): Promise<AppleVerifyResult> {
    const verifier = this.ensureEnabled();
    const plan = await this.plans.findByCode(planCode);
    if (!plan.appleProductId) {
      throw new BadRequestException(
        `Plan ${plan.code} is not configured for Apple In-App Purchase`,
      );
    }

    let transaction: JWSTransactionDecodedPayload;
    try {
      transaction = await verifier.verifyAndDecodeTransaction(jwsRepresentation);
    } catch (err) {
      this.logger.warn(`Apple JWS verification failed: ${(err as Error).message}`);
      throw new BadRequestException('Invalid Apple receipt');
    }

    if (transaction.productId !== plan.appleProductId) {
      throw new BadRequestException(
        `Receipt productId ${transaction.productId} does not match plan ${plan.code}`,
      );
    }
    if (!transaction.originalTransactionId) {
      throw new BadRequestException('Apple receipt missing originalTransactionId');
    }

    const existing = await this.prisma.subscription.findUnique({
      where: { appleOriginalTransactionId: transaction.originalTransactionId },
    });
    if (existing && existing.userId !== userId) {
      throw new ConflictException(
        'This Apple transaction is already linked to another account',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: { include: { plan: true } } },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // If the user is switching CRM plans (e.g. previously Stripe-subscribed
    // to ghl-pro and now buying hubspot-pro via Apple), tear down the old
    // Stripe sub + CRM connection. Same plan + same provider just refreshes
    // the row in place.
    if (
      user.subscription &&
      user.subscription.planId !== plan.id &&
      user.subscription.paymentProvider === PaymentProvider.STRIPE
    ) {
      await this.billing.cancelStripeAndDisableIntegrations(userId, user.subscription);
    }

    const status = appleStatusFromTransaction(transaction);
    const expiresAt = transaction.expiresDate ? new Date(transaction.expiresDate) : null;
    const environment = appleEnvironmentToString(transaction.environment);

    await this.prisma.subscription.upsert({
      where: { userId },
      update: {
        planId: plan.id,
        paymentProvider: PaymentProvider.APPLE,
        status,
        appleOriginalTransactionId: transaction.originalTransactionId,
        appleEnvironment: environment,
        currentPeriodEnd: expiresAt,
        // Apple subs don't ride on a Stripe id — clear any stale leftover
        // from a previous Stripe subscription on the same userId so the row
        // is unambiguous about who owns the billing relationship.
        stripeSubscriptionId: null,
      },
      create: {
        userId,
        planId: plan.id,
        paymentProvider: PaymentProvider.APPLE,
        status,
        appleOriginalTransactionId: transaction.originalTransactionId,
        appleEnvironment: environment,
        currentPeriodEnd: expiresAt,
      },
    });

    return {
      paymentProvider: 'apple',
      status,
      planCode: plan.code,
      expiresAt: expiresAt?.toISOString() ?? null,
    };
  }

  // Server-to-server hook for App Store Server Notifications V2. Apple POSTs
  // a JWS `signedPayload`; we decode it, find the local Subscription row by
  // originalTransactionId, and flip status + currentPeriodEnd accordingly.
  //
  // Subscription is keyed on appleOriginalTransactionId here (not userId)
  // because Apple's payload never includes our userId — the only stable
  // backref is the original transaction we stored on verifyAndUpsert.
  async handleNotification(signedPayload: string): Promise<{ received: true }> {
    const verifier = this.ensureEnabled();

    let payload: ResponseBodyV2DecodedPayload;
    try {
      payload = await verifier.verifyAndDecodeNotification(signedPayload);
    } catch (err) {
      this.logger.warn(`Apple notification verification failed: ${(err as Error).message}`);
      throw new BadRequestException('Invalid Apple signed payload');
    }

    const signedTransaction = payload.data?.signedTransactionInfo;
    if (!signedTransaction) {
      // TEST / EXTERNAL_PURCHASE_TOKEN etc. have no transaction body — ack
      // and move on so Apple stops retrying.
      this.logger.debug(`Apple notification ${payload.notificationType} carried no transaction`);
      return { received: true };
    }

    let transaction: JWSTransactionDecodedPayload;
    try {
      transaction = await verifier.verifyAndDecodeTransaction(signedTransaction);
    } catch (err) {
      this.logger.warn(`Apple transaction verification failed: ${(err as Error).message}`);
      throw new BadRequestException('Invalid Apple transaction');
    }

    const originalTransactionId = transaction.originalTransactionId;
    if (!originalTransactionId) {
      this.logger.warn('Apple notification transaction missing originalTransactionId');
      return { received: true };
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { appleOriginalTransactionId: originalTransactionId },
    });
    if (!subscription) {
      // First time we hear about this transaction — usually a race where the
      // ASN arrives before the client posts to /billing/apple/verify. Apple
      // retries for ~3 days, so a 2xx + no-op is the right call; verify will
      // create the row, and the next ASN will land on it.
      this.logger.warn(
        `Apple notification for unknown originalTransactionId=${originalTransactionId} (type=${payload.notificationType})`,
      );
      return { received: true };
    }

    const nextStatus = appleStatusFromNotification(
      payload.notificationType as NotificationTypeV2 | undefined,
      payload.subtype as Subtype | undefined,
      transaction,
    );
    const expiresAt = transaction.expiresDate ? new Date(transaction.expiresDate) : subscription.currentPeriodEnd;

    await this.prisma.subscription.update({
      where: { userId: subscription.userId },
      data: {
        status: nextStatus,
        currentPeriodEnd: expiresAt,
      },
    });

    if (shouldDisableIntegrations(payload.notificationType as NotificationTypeV2 | undefined, nextStatus)) {
      await this.billing.disableIntegrationsForUser(subscription.userId);
    }

    return { received: true };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private ensureEnabled(): SignedDataVerifier {
    if (!this.config.enabled || !this.verifier) {
      throw new ServiceUnavailableException(
        'Apple In-App Purchase is not configured on this server',
      );
    }
    return this.verifier;
  }

  private buildVerifier(): SignedDataVerifier {
    const roots = loadAppleRootCertificates();
    if (roots.length === 0) {
      throw new Error(
        `No Apple root certificates found in ${APPLE_ROOTS_DIR}. See README in that directory.`,
      );
    }
    // enableOnlineChecks=false in non-production avoids hitting Apple's OCSP
    // responder during sandbox testing (slow + flaky). In Production we want
    // revocation checks on.
    const enableOnlineChecks = this.config.environment === Environment.PRODUCTION;
    return new SignedDataVerifier(
      roots,
      enableOnlineChecks,
      this.config.environment,
      this.config.bundleId,
    );
  }
}

// ── Shared helpers ──────────────────────────────────────────────────────────

function loadAppleRootCertificates(): Buffer[] {
  // Resolve relative to process.cwd() so the same path works for `nest start`
  // (cwd = backend/) and `node dist/main.js` (cwd also = backend/ via systemd
  // WorkingDirectory=). If the directory doesn't exist we treat it as "no
  // roots" rather than crashing the whole module.
  const dir = join(process.cwd(), APPLE_ROOTS_DIR);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((f) => f.toLowerCase().endsWith('.cer') || f.toLowerCase().endsWith('.der'))
    .map((f) => readFileSync(join(dir, f)));
}

function envName(env: Environment): string {
  return env === Environment.PRODUCTION ? 'Production' : 'Sandbox';
}

function appleEnvironmentToString(env: Environment | string | undefined): string | null {
  if (!env) return null;
  if (typeof env === 'string') return env;
  return env === Environment.PRODUCTION ? 'Production' : 'Sandbox';
}

// Maps the JWS transaction expiry into our SubscriptionStatus enum for the
// verify/restore path. Apple doesn't ship an explicit status on the raw
// transaction — we infer it from the expiry vs. now. The notification handler
// has richer signal (notificationType + subtype) and uses the other mapper.
function appleStatusFromTransaction(tx: JWSTransactionDecodedPayload): SubscriptionStatus {
  if (tx.revocationDate) return SubscriptionStatus.CANCELED;
  if (!tx.expiresDate) return SubscriptionStatus.ACTIVE;
  return tx.expiresDate > Date.now() ? SubscriptionStatus.ACTIVE : SubscriptionStatus.CANCELED;
}

function appleStatusFromNotification(
  type: NotificationTypeV2 | undefined,
  _subtype: Subtype | undefined,
  tx: JWSTransactionDecodedPayload,
): SubscriptionStatus {
  switch (type) {
    case NotificationTypeV2.SUBSCRIBED:
    case NotificationTypeV2.DID_RENEW:
    case NotificationTypeV2.OFFER_REDEEMED:
    case NotificationTypeV2.RENEWAL_EXTENDED:
    case NotificationTypeV2.RENEWAL_EXTENSION:
      return SubscriptionStatus.ACTIVE;
    case NotificationTypeV2.DID_FAIL_TO_RENEW:
    case NotificationTypeV2.GRACE_PERIOD_EXPIRED:
      return SubscriptionStatus.PAST_DUE;
    case NotificationTypeV2.EXPIRED:
    case NotificationTypeV2.REFUND:
    case NotificationTypeV2.REVOKE:
      return SubscriptionStatus.CANCELED;
    case NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS:
    case NotificationTypeV2.DID_CHANGE_RENEWAL_PREF:
    case NotificationTypeV2.PRICE_INCREASE:
    case NotificationTypeV2.PRICE_CHANGE:
    case NotificationTypeV2.METADATA_UPDATE:
      // Subscription is still live; expiry is the source of truth.
      return appleStatusFromTransaction(tx);
    default:
      return appleStatusFromTransaction(tx);
  }
}

function shouldDisableIntegrations(
  type: NotificationTypeV2 | undefined,
  nextStatus: SubscriptionStatus,
): boolean {
  // Mirror the Stripe handler: any time the subscription stops being active,
  // turn the CRM integration off so we don't keep pinging GHL/HubSpot for a
  // user who no longer pays. REFUND + REVOKE are the explicit money-back
  // cases; EXPIRED handles natural lapses.
  if (
    type === NotificationTypeV2.REFUND ||
    type === NotificationTypeV2.REVOKE ||
    type === NotificationTypeV2.EXPIRED
  ) {
    return true;
  }
  return (
    nextStatus !== SubscriptionStatus.ACTIVE && nextStatus !== SubscriptionStatus.TRIALING
  );
}
