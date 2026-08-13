-- CreateEnum
CREATE TYPE "SupportRequestCategory" AS ENUM ('ACCOUNT', 'BILLING', 'CRM_GHL', 'CRM_HUBSPOT', 'OPENAI_ASSISTANT', 'VOICE', 'REMINDERS_NOTIFICATIONS', 'CONNECTIVITY', 'PRIVACY_SECURITY', 'FEEDBACK', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "SupportRequest" (
    "id" TEXT NOT NULL,
    "caseReference" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "SupportRequestCategory" NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "deliveryStatus" "SupportDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastDeliveryError" TEXT,
    "nextDeliveryAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "confirmationAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastConfirmationError" TEXT,
    "nextConfirmationAttemptAt" TIMESTAMP(3),
    "confirmationSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportRequest_caseReference_key" ON "SupportRequest"("caseReference");

-- CreateIndex
CREATE UNIQUE INDEX "SupportRequest_userId_clientRequestId_key" ON "SupportRequest"("userId", "clientRequestId");

-- CreateIndex
CREATE INDEX "SupportRequest_userId_createdAt_idx" ON "SupportRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportRequest_deliveryStatus_nextDeliveryAttemptAt_idx" ON "SupportRequest"("deliveryStatus", "nextDeliveryAttemptAt");

-- CreateIndex
CREATE INDEX "SupportRequest_confirmationSentAt_nextConfirmationAttemptAt_idx" ON "SupportRequest"("confirmationSentAt", "nextConfirmationAttemptAt");

-- AddForeignKey
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
