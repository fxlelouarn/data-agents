/*
  Warnings:

  - You are about to drop the column `registrationEndDate` on the `edition_cache` table. All the data in the column will be lost.
  - You are about to drop the column `registrationStartDate` on the `edition_cache` table. All the data in the column will be lost.
  - You are about to drop the column `timezone` on the `edition_cache` table. All the data in the column will be lost.
  - You are about to drop the column `address` on the `event_cache` table. All the data in the column will be lost.
  - You are about to drop the column `facebook` on the `event_cache` table. All the data in the column will be lost.
  - You are about to drop the column `instagram` on the `event_cache` table. All the data in the column will be lost.
  - You are about to drop the column `website` on the `event_cache` table. All the data in the column will be lost.
  - You are about to drop the column `distance` on the `race_cache` table. All the data in the column will be lost.
  - You are about to drop the column `elevation` on the `race_cache` table. All the data in the column will be lost.
  - Added the required column `country` to the `event_cache` table without a default value. This is not possible if the table is not empty.
  - Added the required column `countrySubdivisionNameLevel1` to the `event_cache` table without a default value. This is not possible if the table is not empty.
  - Added the required column `countrySubdivisionNameLevel2` to the `event_cache` table without a default value. This is not possible if the table is not empty.
  - Made the column `city` on table `event_cache` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "DatabaseType" AS ENUM ('POSTGRESQL', 'MYSQL', 'SQLITE', 'MONGODB', 'EXTERNAL_API', 'MILES_REPUBLIC');

-- AlterTable
ALTER TABLE "edition_cache" DROP COLUMN "registrationEndDate",
DROP COLUMN "registrationStartDate",
DROP COLUMN "timezone",
ADD COLUMN     "clientStatus" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'EUR',
ADD COLUMN     "customerType" TEXT,
ADD COLUMN     "dataSource" TEXT,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "federationId" TEXT,
ADD COLUMN     "medusaVersion" TEXT NOT NULL DEFAULT 'V1',
ADD COLUMN     "registrationClosingDate" TIMESTAMP(3),
ADD COLUMN     "registrationOpeningDate" TIMESTAMP(3),
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "timeZone" TEXT DEFAULT 'Europe/Paris',
ALTER COLUMN "year" SET DATA TYPE TEXT,
ALTER COLUMN "calendarStatus" SET DEFAULT 'CONFIRMED';

-- AlterTable
ALTER TABLE "event_cache" DROP COLUMN "address",
DROP COLUMN "facebook",
DROP COLUMN "instagram",
DROP COLUMN "website",
ADD COLUMN     "country" TEXT NOT NULL,
ADD COLUMN     "countrySubdivisionDisplayCodeLevel1" TEXT,
ADD COLUMN     "countrySubdivisionDisplayCodeLevel2" TEXT,
ADD COLUMN     "countrySubdivisionNameLevel1" TEXT NOT NULL,
ADD COLUMN     "countrySubdivisionNameLevel2" TEXT NOT NULL,
ADD COLUMN     "coverImage" TEXT,
ADD COLUMN     "dataSource" TEXT,
ADD COLUMN     "facebookUrl" TEXT,
ADD COLUMN     "fullAddress" TEXT,
ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isRecommended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "twitterUrl" TEXT,
ADD COLUMN     "websiteUrl" TEXT,
ALTER COLUMN "city" SET NOT NULL;

-- AlterTable
ALTER TABLE "race_cache" DROP COLUMN "distance",
DROP COLUMN "elevation",
ADD COLUMN     "adultJustificativeOptions" TEXT,
ADD COLUMN     "bikeDistance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "bikeNegativeElevation" DOUBLE PRECISION,
ADD COLUMN     "bikePositiveElevation" DOUBLE PRECISION,
ADD COLUMN     "bikeRunDistance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "categoryLevel1" TEXT,
ADD COLUMN     "categoryLevel2" TEXT,
ADD COLUMN     "dataSource" TEXT,
ADD COLUMN     "distanceCategory" TEXT,
ADD COLUMN     "externalFunnelURL" TEXT,
ADD COLUMN     "federationId" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "licenseNumberType" TEXT NOT NULL DEFAULT 'FFA',
ADD COLUMN     "maxTeamSize" INTEGER,
ADD COLUMN     "medusaProductId" TEXT,
ADD COLUMN     "minTeamSize" INTEGER,
ADD COLUMN     "minorJustificativeOptions" TEXT,
ADD COLUMN     "paymentCollectionType" TEXT NOT NULL DEFAULT 'SINGLE',
ADD COLUMN     "priceType" TEXT NOT NULL DEFAULT 'PER_TEAM',
ADD COLUMN     "raceVariantStoreId" TEXT,
ADD COLUMN     "registrationClosingDate" TIMESTAMP(3),
ADD COLUMN     "registrationOpeningDate" TIMESTAMP(3),
ADD COLUMN     "resaleEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "runDistance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "runDistance2" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "runNegativeElevation" DOUBLE PRECISION,
ADD COLUMN     "runPositiveElevation" DOUBLE PRECISION,
ADD COLUMN     "swimDistance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "swimRunDistance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "timeZone" TEXT,
ADD COLUMN     "walkDistance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "walkNegativeElevation" DOUBLE PRECISION,
ADD COLUMN     "walkPositiveElevation" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "database_connections" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "DatabaseType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "host" TEXT,
    "port" INTEGER,
    "database" TEXT,
    "username" TEXT,
    "password" TEXT,
    "connectionUrl" TEXT,
    "sslMode" TEXT DEFAULT 'prefer',
    "timeout" INTEGER DEFAULT 30000,
    "maxConnections" INTEGER DEFAULT 10,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastTestedAt" TIMESTAMP(3),
    "isHealthy" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "database_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "database_connections_name_key" ON "database_connections"("name");
