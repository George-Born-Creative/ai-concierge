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

  await prisma.plan.upsert({
    where: { code: 'ghl-pro' },
    update: {
      name: 'GoHighLevel plan',
      provider: CrmProvider.GHL,
      stripePriceId: ghlPrice,
      monthlyPrice: 2900,
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
      monthlyPrice: 2900,
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
      monthlyPrice: 2900,
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
      monthlyPrice: 2900,
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
