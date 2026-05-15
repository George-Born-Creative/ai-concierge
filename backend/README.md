# AI-Concierge Backend

NestJS API that powers the AI-Concierge mobile app: authentication, plans,
Stripe subscriptions, CRM OAuth (GoHighLevel, HubSpot), encrypted OpenAI key
storage, and voice transcription.

## Stack

- **Runtime:** Node.js 20+ (developed on Node 22)
- **Framework:** NestJS 10
- **Database:** PostgreSQL via Prisma 5
- **Auth:** Passport JWT + Argon2 password hashing
- **Billing:** Stripe (subscriptions + PaymentSheet + webhooks)
- **Crypto:** AES-256-GCM for tokens and OpenAI keys at rest

## Local setup

```bash
# 1. Install deps (run from this folder)
cd backend
npm install

# 2. Copy env and fill in values
cp .env.example .env

# 3. Start a Postgres instance somewhere (docker, Render, Supabase, local...).
#    Point DATABASE_URL in .env at it.

# 4. Generate Prisma client + run the first migration
npm run prisma:migrate -- --name init

# 5. Seed plans (creates the GHL and HubSpot plan rows)
npm run seed

# 6. Run the server
npm run start:dev
```

The API listens on `http://localhost:4000` by default.

## Stripe setup (one-time)

1. Create two **recurring** prices in the Stripe dashboard:
   - `GoHighLevel plan` — $29/mo
   - `HubSpot plan` — $29/mo
2. Copy each price id into `.env`:
   - `STRIPE_PRICE_GHL=price_...`
   - `STRIPE_PRICE_HUBSPOT=price_...`
3. Create a webhook endpoint pointing at `POST /webhooks/stripe` and
   subscribe to:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

For local development run `stripe listen --forward-to localhost:4000/webhooks/stripe`.

## Encryption key

Generate a 32-byte hex string and put it in `ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Endpoints (Phase 1)

| Method | Path                          | Auth | Description                                          |
| ------ | ----------------------------- | ---- | ---------------------------------------------------- |
| POST   | `/auth/signup`                | -    | Create user, returns JWT                             |
| POST   | `/auth/signin`                | -    | Sign in, returns JWT                                 |
| POST   | `/auth/signout`               | JWT  | Stateless no-op (token kept on device)               |
| GET    | `/auth/me`                    | JWT  | Current user + subscription + integration summary    |
| GET    | `/plans`                      | -    | List active plans                                    |
| POST   | `/billing/payment-sheet`      | JWT  | Returns PaymentSheet params for the chosen plan      |
| POST   | `/billing/subscription/cancel`| JWT  | Cancel the active subscription                       |
| POST   | `/webhooks/stripe`            | raw  | Stripe webhook (signature verified)                  |

Phase 2 (CRM OAuth) and Phase 3 (OpenAI key + voice) are scaffolded later.
