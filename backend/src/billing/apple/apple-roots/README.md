# Apple Root Certificates

The `SignedDataVerifier` from `@apple/app-store-server-library` validates JWS
signatures against Apple's root CA chain. Apple ships the certificates publicly
at <https://www.apple.com/certificateauthority/> — they are not included in the
npm package, so we keep them here and load them at boot.

## Required files (DER-encoded `.cer`)

Drop these two files in this directory before enabling Apple IAP:

- `AppleIncRootCertificate.cer` — Apple Inc. Root certificate
- `AppleRootCA-G3.cer` — Apple Root CA G3 (used by current App Store signing)

Download links (direct from Apple):

- <https://www.apple.com/appleca/AppleIncRootCertificate.cer>
- <https://www.apple.com/certificateauthority/AppleRootCA-G3.cer>

## Behaviour when missing

`AppleBillingService` logs a warning at boot and disables the Apple endpoints
(`/billing/apple/verify`, `/billing/apple/restore`, `/webhooks/apple` respond
with HTTP 503). This keeps the rest of the backend (Stripe + CRM) running
even when the host hasn't been provisioned for Apple IAP yet.

## Rotating

When Apple announces a new root, add the new `.cer` here without removing the
old one — production transactions can still be signed by the previous root for
a grace period. The verifier accepts any cert in this directory.

## Why not vendor them

We deliberately do not commit binary `.cer` files. The same image runs in dev,
staging, and prod; the certs are downloaded once at deploy time and dropped on
disk (via the EAS / EC2 provisioning script). Keeps the diff readable.
