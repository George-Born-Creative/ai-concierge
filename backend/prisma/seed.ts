import { CrmProvider, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ghlPrice = process.env.STRIPE_PRICE_GHL;
  const hubspotPrice = process.env.STRIPE_PRICE_HUBSPOT;

  if (!ghlPrice || !hubspotPrice) {
    throw new Error(
      'STRIPE_PRICE_GHL and STRIPE_PRICE_HUBSPOT must be set before seeding. ' +
        'Create the recurring prices in the Stripe dashboard first.',
    );
  }

  // `monthlyPrice` is the Stripe / web price (used for Android PaymentSheet
  // and the iOS Stripe-via-web Checkout option). `applePrice` is the Apple
  // IAP price set in App Store Connect — usually higher to absorb Apple's 30%.
  // Adjust both with the client when finalising the discount strategy; the
  // values below are placeholders that match the current Stripe prices.
  const ghlMonthlyPrice = Number(process.env.PLAN_GHL_MONTHLY_PRICE ?? 2900);
  const ghlApplePrice = Number(process.env.PLAN_GHL_APPLE_PRICE ?? 2900);
  const hubspotMonthlyPrice = Number(process.env.PLAN_HUBSPOT_MONTHLY_PRICE ?? 2900);
  const hubspotApplePrice = Number(process.env.PLAN_HUBSPOT_APPLE_PRICE ?? 2900);

  const ghlAppleProductId =
    process.env.APPLE_PRODUCT_GHL ?? 'com.daveget.aiconcierge.ghl_pro_monthly';
  const hubspotAppleProductId =
    process.env.APPLE_PRODUCT_HUBSPOT ?? 'com.daveget.aiconcierge.hubspot_pro_monthly';

  await prisma.plan.upsert({
    where: { code: 'ghl-pro' },
    update: {
      name: 'GoHighLevel plan',
      provider: CrmProvider.GHL,
      stripePriceId: ghlPrice,
      monthlyPrice: ghlMonthlyPrice,
      applePrice: ghlApplePrice,
      appleProductId: ghlAppleProductId,
      features: [
        'Voice AI tied to your GoHighLevel CRM',
        'Lead capture into GHL contacts',
        'Notes, tasks and opportunities',
        'Encrypted OpenAI key storage',
      ],
      isActive: true,
    },
    create: {
      code: 'ghl-pro',
      name: 'GoHighLevel plan',
      provider: CrmProvider.GHL,
      stripePriceId: ghlPrice,
      monthlyPrice: ghlMonthlyPrice,
      applePrice: ghlApplePrice,
      appleProductId: ghlAppleProductId,
      features: [
        'Voice AI tied to your GoHighLevel CRM',
        'Lead capture into GHL contacts',
        'Notes, tasks and opportunities',
        'Encrypted OpenAI key storage',
      ],
    },
  });

  await prisma.plan.upsert({
    where: { code: 'hubspot-pro' },
    update: {
      name: 'HubSpot plan',
      provider: CrmProvider.HUBSPOT,
      stripePriceId: hubspotPrice,
      monthlyPrice: hubspotMonthlyPrice,
      applePrice: hubspotApplePrice,
      appleProductId: hubspotAppleProductId,
      features: [
        'Voice AI tied to your HubSpot CRM',
        'Lead capture into HubSpot contacts',
        'Deals, notes and tasks',
        'Encrypted OpenAI key storage',
      ],
      isActive: true,
    },
    create: {
      code: 'hubspot-pro',
      name: 'HubSpot plan',
      provider: CrmProvider.HUBSPOT,
      stripePriceId: hubspotPrice,
      monthlyPrice: hubspotMonthlyPrice,
      applePrice: hubspotApplePrice,
      appleProductId: hubspotAppleProductId,
      features: [
        'Voice AI tied to your HubSpot CRM',
        'Lead capture into HubSpot contacts',
        'Deals, notes and tasks',
        'Encrypted OpenAI key storage',
      ],
    },
  });

  // eslint-disable-next-line no-console
  console.log('Seeded plans: ghl-pro, hubspot-pro');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
