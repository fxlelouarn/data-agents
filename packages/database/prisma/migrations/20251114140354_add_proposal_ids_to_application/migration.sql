-- AlterTable
ALTER TABLE "proposal_applications" ADD COLUMN     "proposalIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
