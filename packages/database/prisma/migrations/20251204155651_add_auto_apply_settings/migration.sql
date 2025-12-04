-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "autoApplyIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "autoApplyLastRunAt" TIMESTAMP(3),
ADD COLUMN     "autoApplyLastRunResult" JSONB,
ADD COLUMN     "autoApplyNextRunAt" TIMESTAMP(3),
ADD COLUMN     "enableAutoApplyUpdates" BOOLEAN NOT NULL DEFAULT false;
