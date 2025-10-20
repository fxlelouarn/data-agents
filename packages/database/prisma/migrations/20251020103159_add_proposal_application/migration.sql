-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'APPLIED', 'FAILED');

-- CreateTable
CREATE TABLE "proposal_applications" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "logs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "appliedChanges" JSONB,
    "rollbackData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposal_applications_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "proposal_applications" ADD CONSTRAINT "proposal_applications_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
