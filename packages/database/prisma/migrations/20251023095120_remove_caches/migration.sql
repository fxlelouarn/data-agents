/*
  Warnings:

  - You are about to drop the `edition_cache` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `event_cache` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `race_cache` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "edition_cache" DROP CONSTRAINT "edition_cache_eventId_fkey";

-- DropForeignKey
ALTER TABLE "race_cache" DROP CONSTRAINT "race_cache_editionId_fkey";

-- DropTable
DROP TABLE "edition_cache";

-- DropTable
DROP TABLE "event_cache";

-- DropTable
DROP TABLE "race_cache";
