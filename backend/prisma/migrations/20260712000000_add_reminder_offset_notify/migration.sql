-- Add reminder offset + explicit notify time.
ALTER TABLE "Reminder" ADD COLUMN "remindOffsetMinutes" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "Reminder" ADD COLUMN "notifyAt" TIMESTAMP(3);

-- Backfill: existing rows fired at dueAt, so preserve that behaviour
-- (notifyAt = dueAt, offset = 0).
UPDATE "Reminder" SET "notifyAt" = "dueAt";
UPDATE "Reminder" SET "remindOffsetMinutes" = 0;

ALTER TABLE "Reminder" ALTER COLUMN "notifyAt" SET NOT NULL;

-- Dispatch now scans by notifyAt instead of dueAt.
DROP INDEX IF EXISTS "Reminder_status_dueAt_idx";
CREATE INDEX "Reminder_status_notifyAt_idx" ON "Reminder"("status", "notifyAt");
