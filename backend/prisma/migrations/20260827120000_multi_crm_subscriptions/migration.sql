-- Allow one subscription per CRM plan, and store which CRM is currently active.

ALTER TABLE "User" ADD COLUMN "activeCrmProvider" "CrmProvider";

DROP INDEX "Subscription_userId_key";

CREATE UNIQUE INDEX "Subscription_userId_planId_key" ON "Subscription"("userId", "planId");

CREATE INDEX "Subscription_userId_status_idx" ON "Subscription"("userId", "status");

UPDATE "User" AS u
SET "activeCrmProvider" = p."provider"
FROM "Subscription" AS s
INNER JOIN "Plan" AS p ON p."id" = s."planId"
WHERE s."userId" = u."id"
  AND u."activeCrmProvider" IS NULL;
