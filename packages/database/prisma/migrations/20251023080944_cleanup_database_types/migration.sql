/*
  Warnings:

  - The values [MYSQL,SQLITE,MONGODB,EXTERNAL_API] on the enum `DatabaseType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "DatabaseType_new" AS ENUM ('POSTGRESQL', 'MILES_REPUBLIC');
ALTER TABLE "database_connections" ALTER COLUMN "type" TYPE "DatabaseType_new" USING ("type"::text::"DatabaseType_new");
ALTER TYPE "DatabaseType" RENAME TO "DatabaseType_old";
ALTER TYPE "DatabaseType_new" RENAME TO "DatabaseType";
DROP TYPE "DatabaseType_old";
COMMIT;
