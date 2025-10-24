-- AlterTable
ALTER TABLE "proposals" ADD COLUMN     "modificationReason" TEXT,
ADD COLUMN     "modifiedAt" TIMESTAMP(3),
ADD COLUMN     "modifiedBy" TEXT,
ADD COLUMN     "userModifiedChanges" JSONB;
