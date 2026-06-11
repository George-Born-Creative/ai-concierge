-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'APPLE');

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "applePrice" INTEGER,
ADD COLUMN     "appleProductId" TEXT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "appleEnvironment" TEXT,
ADD COLUMN     "appleOriginalTransactionId" TEXT,
ADD COLUMN     "paymentProvider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE';

-- CreateIndex
CREATE UNIQUE INDEX "Plan_appleProductId_key" ON "Plan"("appleProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_appleOriginalTransactionId_key" ON "Subscription"("appleOriginalTransactionId");
