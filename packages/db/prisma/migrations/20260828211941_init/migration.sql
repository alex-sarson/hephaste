-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPPORT', 'BILLING_OPS', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUOTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "LineItemType" AS ENUM ('LABOUR', 'MATERIALS', 'OTHER');

-- CreateEnum
CREATE TYPE "TriggerSource" AS ENUM ('MANUAL_USER', 'EMAIL_WEBHOOK', 'SCHEDULED_JOB', 'ADMIN');

-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('SENT', 'DELIVERED', 'OPENED', 'BOUNCED', 'SPAM_COMPLAINT');

-- CreateEnum
CREATE TYPE "BackgroundJobType" AS ENUM ('SEND_INVOICE_EMAIL', 'DETECT_OVERDUE', 'SEND_REMINDER');

-- CreateEnum
CREATE TYPE "BackgroundJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "auth_provider_id" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "postcode" TEXT,
    "country" TEXT,
    "logo_url" TEXT,
    "bank_account_name" TEXT,
    "bank_sort_code" TEXT,
    "bank_account_number" TEXT,
    "vat_number" TEXT,
    "default_tax_rate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "invoice_number_prefix" TEXT NOT NULL DEFAULT 'INV-',
    "invoice_number_seq" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "auth_provider_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'SUPPORT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_account_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "postcode" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'QUOTED',
    "scheduled_start" TIMESTAMP(3),
    "scheduled_end" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "postcode" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_notes" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_materials" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit_cost" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "overdue" BOOLEAN NOT NULL DEFAULT false,
    "issue_date" DATE,
    "due_date" DATE,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "tax_rate" DECIMAL(5,4) NOT NULL,
    "tax_amount" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "amount_paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paid_at" TIMESTAMP(3),
    "paid_method" TEXT,
    "notes_to_customer" TEXT,
    "pdf_url" TEXT,
    "sent_at" TIMESTAMP(3),
    "first_viewed_at" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "LineItemType" NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "line_total" DECIMAL(10,2) NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_status_events" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "from_status" "InvoiceStatus",
    "to_status" "InvoiceStatus" NOT NULL,
    "triggered_by" "TriggerSource" NOT NULL,
    "actor_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_events" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "provider_message_id" TEXT NOT NULL,
    "event_type" "EmailEventType" NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_jobs" (
    "id" TEXT NOT NULL,
    "account_id" TEXT,
    "type" "BackgroundJobType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "BackgroundJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "run_after" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_auth_provider_id_key" ON "accounts"("auth_provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "admins_auth_provider_id_key" ON "admins"("auth_provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE INDEX "admin_audit_logs_target_account_id_idx" ON "admin_audit_logs"("target_account_id");

-- CreateIndex
CREATE INDEX "customers_account_id_idx" ON "customers"("account_id");

-- CreateIndex
CREATE INDEX "jobs_account_id_idx" ON "jobs"("account_id");

-- CreateIndex
CREATE INDEX "jobs_account_id_status_idx" ON "jobs"("account_id", "status");

-- CreateIndex
CREATE INDEX "job_notes_account_id_idx" ON "job_notes"("account_id");

-- CreateIndex
CREATE INDEX "job_notes_job_id_idx" ON "job_notes"("job_id");

-- CreateIndex
CREATE INDEX "job_materials_account_id_idx" ON "job_materials"("account_id");

-- CreateIndex
CREATE INDEX "job_materials_job_id_idx" ON "job_materials"("job_id");

-- CreateIndex
CREATE INDEX "attachments_account_id_idx" ON "attachments"("account_id");

-- CreateIndex
CREATE INDEX "attachments_job_id_idx" ON "attachments"("job_id");

-- CreateIndex
CREATE INDEX "invoices_account_id_status_idx" ON "invoices"("account_id", "status");

-- CreateIndex
CREATE INDEX "invoices_account_id_overdue_idx" ON "invoices"("account_id", "overdue");

-- CreateIndex
CREATE INDEX "invoices_job_id_idx" ON "invoices"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_account_id_invoice_number_key" ON "invoices"("account_id", "invoice_number");

-- CreateIndex
CREATE INDEX "invoice_line_items_account_id_idx" ON "invoice_line_items"("account_id");

-- CreateIndex
CREATE INDEX "invoice_line_items_invoice_id_idx" ON "invoice_line_items"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_status_events_account_id_idx" ON "invoice_status_events"("account_id");

-- CreateIndex
CREATE INDEX "invoice_status_events_invoice_id_idx" ON "invoice_status_events"("invoice_id");

-- CreateIndex
CREATE INDEX "email_events_account_id_idx" ON "email_events"("account_id");

-- CreateIndex
CREATE INDEX "email_events_invoice_id_idx" ON "email_events"("invoice_id");

-- CreateIndex
CREATE INDEX "email_events_provider_message_id_idx" ON "email_events"("provider_message_id");

-- CreateIndex
CREATE INDEX "background_jobs_status_run_after_idx" ON "background_jobs"("status", "run_after");

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_notes" ADD CONSTRAINT "job_notes_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_notes" ADD CONSTRAINT "job_notes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_materials" ADD CONSTRAINT "job_materials_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_materials" ADD CONSTRAINT "job_materials_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_status_events" ADD CONSTRAINT "invoice_status_events_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_status_events" ADD CONSTRAINT "invoice_status_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
