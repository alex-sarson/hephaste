-- CreateEnum
CREATE TYPE "JobLocationType" AS ENUM ('ON_SITE', 'REMOTE', 'IN_HOUSE');

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "location_type" "JobLocationType" NOT NULL DEFAULT 'ON_SITE';
