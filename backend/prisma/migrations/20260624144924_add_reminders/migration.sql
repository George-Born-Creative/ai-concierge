-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('SCHEDULED', 'SNOOZED', 'DELIVERED', 'DISMISSED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ReminderLinkType" AS ENUM ('CONTACT', 'COMPANY', 'DEAL', 'APPOINTMENT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "expoPushToken" TEXT,
ADD COLUMN     "timezone" TEXT;

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'SCHEDULED',
    "snoozedUntil" TIMESTAMP(3),
    "linkType" "ReminderLinkType",
    "linkProvider" "CrmProvider",
    "linkExternalId" TEXT,
    "linkLabel" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "source" "AssistantMessageSource" NOT NULL DEFAULT 'text',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reminder_userId_dueAt_idx" ON "Reminder"("userId", "dueAt");

-- CreateIndex
CREATE INDEX "Reminder_status_dueAt_idx" ON "Reminder"("status", "dueAt");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
