-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "enableLlmMatching" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "llmMatchingApiKey" TEXT,
ADD COLUMN     "llmMatchingModel" TEXT DEFAULT 'claude-haiku-4-5-20251001',
ADD COLUMN     "llmMatchingShadowMode" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "llm_matching_logs" (
    "id" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "proposalId" TEXT,
    "inputSummary" TEXT NOT NULL,
    "currentResult" JSONB NOT NULL,
    "llmResult" JSONB NOT NULL,
    "diverged" BOOLEAN NOT NULL,
    "responseTimeMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_matching_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "llm_matching_logs_matchType_createdAt_idx" ON "llm_matching_logs"("matchType", "createdAt");

-- CreateIndex
CREATE INDEX "llm_matching_logs_diverged_createdAt_idx" ON "llm_matching_logs"("diverged", "createdAt");

-- CreateIndex
CREATE INDEX "llm_matching_logs_proposalId_idx" ON "llm_matching_logs"("proposalId");
