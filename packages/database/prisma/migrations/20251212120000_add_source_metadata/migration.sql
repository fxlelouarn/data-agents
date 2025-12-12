-- Add sourceMetadata column to proposals table
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "sourceMetadata" JSONB;
