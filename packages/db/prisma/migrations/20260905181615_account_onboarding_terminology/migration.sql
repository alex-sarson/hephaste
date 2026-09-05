-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "asset_label_plural" TEXT,
ADD COLUMN     "asset_label_singular" TEXT,
ADD COLUMN     "customer_label_plural" TEXT,
ADD COLUMN     "customer_label_singular" TEXT,
ADD COLUMN     "industry" TEXT NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "job_label_plural" TEXT,
ADD COLUMN     "job_label_singular" TEXT,
ADD COLUMN     "onboarding_completed_at" TIMESTAMP(3);
