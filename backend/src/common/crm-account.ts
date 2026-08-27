import { CrmProvider, SubscriptionStatus } from '@prisma/client';

export const ACTIVE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
];

export type CrmKey = 'ghl' | 'hubspot';

/**
 * Narrow Prisma surface for these helpers and unit tests.
 * Method syntax (not function properties) keeps PrismaClient assignable
 * without Pick<PrismaClient>, which collapses findUnique's select result to `never`.
 */
export type PrismaLike = {
  user: {
    findUnique(args: { where: { id: string }; select?: object }): Promise<unknown>;
    update(args: {
      where: { id: string };
      data: { activeCrmProvider: CrmProvider | null };
    }): Promise<unknown>;
    updateMany(args: {
      where: { id: string; activeCrmProvider: null };
      data: { activeCrmProvider: CrmProvider };
    }): Promise<{ count: number }>;
  };
  subscription: {
    findFirst(args: object): Promise<{ id: string } | null>;
  };
  integrationConnection: {
    findUnique(args: object): Promise<{ enabled: boolean } | null>;
    updateMany(args: object): Promise<{ count: number }>;
  };
};

type UserCrmFallback = {
  activeCrmProvider: CrmProvider | null;
  subscriptions: Array<{
    status: SubscriptionStatus;
    plan: { provider: CrmProvider };
  }>;
  integrations: Array<{
    provider: CrmProvider;
    enabled: boolean;
  }>;
};

export function isActiveSubscriptionStatus(
  status: SubscriptionStatus | null | undefined,
): boolean {
  return !!status && ACTIVE_SUBSCRIPTION_STATUSES.includes(status);
}

export function crmKey(provider: CrmProvider): CrmKey {
  return provider === CrmProvider.HUBSPOT ? 'hubspot' : 'ghl';
}

export function parseCrmProvider(value: string | null | undefined): CrmProvider | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'ghl') return CrmProvider.GHL;
  if (normalized === 'hubspot') return CrmProvider.HUBSPOT;
  return null;
}

export async function userHasCrmPlan(
  prisma: PrismaLike,
  userId: string,
  provider: CrmProvider,
): Promise<boolean> {
  const row = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ACTIVE_SUBSCRIPTION_STATUSES },
      plan: { provider },
    },
    select: { id: true },
  });
  return Boolean(row);
}

export async function userHasCrmConnection(
  prisma: PrismaLike,
  userId: string,
  provider: CrmProvider,
): Promise<boolean> {
  const row = await prisma.integrationConnection.findUnique({
    where: { userId_provider: { userId, provider } },
    select: { enabled: true },
  });
  return row?.enabled === true;
}

/**
 * Saved active CRM, or null when the user hasn't picked one yet.
 * Does not fall back to "first enabled connection" — that hid HubSpot
 * behind an arbitrary GHL row when both were connected.
 */
export async function resolveActiveCrmProvider(
  prisma: PrismaLike,
  userId: string,
): Promise<CrmProvider | null> {
  const user = (await prisma.user.findUnique({
    where: { id: userId },
    select: { activeCrmProvider: true },
  })) as { activeCrmProvider: CrmProvider | null } | null;
  return user?.activeCrmProvider ?? null;
}

export async function setActiveCrmProviderIfNull(
  prisma: PrismaLike,
  userId: string,
  provider: CrmProvider,
): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, activeCrmProvider: null },
    data: { activeCrmProvider: provider },
  });
}

export async function setActiveCrmProvider(
  prisma: PrismaLike,
  userId: string,
  provider: CrmProvider,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { activeCrmProvider: provider },
  });
}

/** Only one CRM may be connected. Connecting one disables the other. */
export async function disableOtherCrmConnections(
  prisma: PrismaLike,
  userId: string,
  provider: CrmProvider,
): Promise<void> {
  await prisma.integrationConnection.updateMany({
    where: { userId, provider: { not: provider }, enabled: true },
    data: { enabled: false, accessToken: '', refreshToken: '' },
  });
}

/**
 * After a CRM plan lapses, keep assistant/home on a remaining entitled+connected
 * CRM when possible; otherwise clear the active provider.
 */
export async function fallbackActiveCrmProvider(
  prisma: PrismaLike,
  userId: string,
): Promise<CrmProvider | null> {
  const user = (await prisma.user.findUnique({
    where: { id: userId },
    select: {
      activeCrmProvider: true,
      subscriptions: { select: { status: true, plan: { select: { provider: true } } } },
      integrations: { select: { provider: true, enabled: true } },
    },
  })) as UserCrmFallback | null;
  if (!user) return null;

  const entitled = new Set(
    user.subscriptions
      .filter((row) => isActiveSubscriptionStatus(row.status))
      .map((row) => row.plan.provider),
  );
  const connected = new Set(
    user.integrations.filter((row) => row.enabled).map((row) => row.provider),
  );
  const usable = [...entitled].filter((provider) => connected.has(provider));

  const next =
    (user.activeCrmProvider && usable.includes(user.activeCrmProvider)
      ? user.activeCrmProvider
      : usable[0]) ?? null;

  if (next !== user.activeCrmProvider) {
    await prisma.user.update({
      where: { id: userId },
      data: { activeCrmProvider: next },
    });
  }
  return next;
}
