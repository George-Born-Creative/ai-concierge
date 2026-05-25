import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const rows = await prisma.openAIKey.findMany({
  include: { user: { select: { email: true } } },
  orderBy: { updatedAt: 'desc' },
});

for (const row of rows) {
  console.log(
    JSON.stringify({
      userId: row.userId,
      email: row.user.email,
      last4: row.last4,
      updatedAt: row.updatedAt.toISOString(),
    }),
  );
}

await prisma.$disconnect();
