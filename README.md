# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Stripe billing

Subscriptions are powered by Stripe, with the rule **one subscription = one CRM** (GoHighLevel or HubSpot).

### How it works

```
plan screen (mobile)            backend (/billing/payment-sheet)             Stripe
─────────────────────           ────────────────────────────────             ──────
user taps Subscribe ─► POST { planCode } ──► creates Customer (cached)
                                            creates Subscription
                                            (payment_behavior: incomplete)
                                            ◄────── PaymentIntent + ephemeral key
                  ◄── { paymentIntent, ephemeralKey, customer, publishableKey }
initPaymentSheet(...)
presentPaymentSheet() ────────────────────────────────────────────────► card collected,
                                                                         3-D Secure handled
                                            ◄────── webhook events
                                            POST /webhooks/stripe
                                            (signature verified, updates
                                            Subscription.status,
                                            disables CRM on cancel)
user lands on /connect
```

Key behaviour:

- **PaymentSheet opens natively** from the plan screen — no intermediate confirmation page.
- Backend enforces one active sub: the same plan twice is rejected, switching CRM cancels the previous sub and disables the linked integration.
- A Stripe webhook (`POST /webhooks/stripe`) keeps `Subscription.status` in sync and auto-disables CRM integrations when a sub becomes inactive.

### Where the pieces live

| Concern | File |
| --- | --- |
| Backend service (create subscription, cancel, webhook handler) | [backend/src/billing/billing.service.ts](backend/src/billing/billing.service.ts) |
| Webhook signature verification | [backend/src/billing/stripe.webhook.controller.ts](backend/src/billing/stripe.webhook.controller.ts) |
| Prisma schema (Plan, Subscription) | [backend/prisma/schema.prisma](backend/prisma/schema.prisma) |
| Plan seed (mirrors Stripe price IDs) | [backend/prisma/seed.ts](backend/prisma/seed.ts) |
| Mobile API client | [lib/api/payment.ts](lib/api/payment.ts) |
| Plan screen + PaymentSheet launch | [components/onboarding/plan-selection-screen.tsx](components/onboarding/plan-selection-screen.tsx) |
| Stripe SDK wrapper (native / web fallback) | [components/stripe-wrapper.native.tsx](components/stripe-wrapper.native.tsx) |

### Required env vars

`backend/.env`:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRICE_GHL=price_...        # recurring price for ghl-pro
STRIPE_PRICE_HUBSPOT=price_...    # recurring price for hubspot-pro
STRIPE_WEBHOOK_SECRET=whsec_...   # from `stripe listen` or the dashboard
```

Mobile `.env`:

```
EXPO_PUBLIC_API_BASE_URL=http://<your-PC-LAN-ip>:4000
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...   # must match backend
```

After changing price IDs, re-run the seed so the local `Plan` table mirrors Stripe:

```bash
cd backend
npm run seed
```

### Local testing

1. `cd backend && npm run start:dev`
2. In another terminal: `stripe listen --forward-to localhost:4000/webhooks/stripe` (paste the `whsec_...` into `backend/.env` and restart).
3. `npm start` (Expo), reload the app, sign up, pick a plan, tap **Subscribe with Stripe**.
4. Use a test card:
   - `4242 4242 4242 4242` — succeeds
   - `4000 0027 6000 3184` — requires 3-D Secure
   - `4000 0000 0000 9995` — declined

On success, the app routes to `/connect` and the Stripe CLI / backend log shows the subscription becoming `ACTIVE`.

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
