// Mirrors the enums in packages/db/prisma/schema.prisma. Kept as plain Zod
// enums here (rather than importing from @prisma/client) so apps/web never
// needs a dependency on the Prisma client — only apps/api and the
// jobs-runner talk to the database directly.
import { z } from "zod";

export const jobStatusSchema = z.enum([
  "QUOTED",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETE",
  "CANCELLED",
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const invoiceStatusSchema = z.enum(["DRAFT", "SENT", "VIEWED", "PAID", "VOID"]);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const lineItemTypeSchema = z.enum(["LABOUR", "MATERIALS", "OTHER"]);
export type LineItemType = z.infer<typeof lineItemTypeSchema>;

export const triggerSourceSchema = z.enum([
  "MANUAL_USER",
  "EMAIL_WEBHOOK",
  "SCHEDULED_JOB",
  "ADMIN",
]);
export type TriggerSource = z.infer<typeof triggerSourceSchema>;

export const emailEventTypeSchema = z.enum([
  "SENT",
  "DELIVERED",
  "OPENED",
  "BOUNCED",
  "SPAM_COMPLAINT",
]);
export type EmailEventType = z.infer<typeof emailEventTypeSchema>;

export const adminRoleSchema = z.enum(["SUPPORT", "BILLING_OPS", "SUPERADMIN"]);
export type AdminRole = z.infer<typeof adminRoleSchema>;
