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

// Where the work happens — generic across industries. Only ON_SITE makes
// the job's address fields meaningful; see schema.prisma's Job model.
export const jobLocationTypeSchema = z.enum(["ON_SITE", "REMOTE", "IN_HOUSE"]);
export type JobLocationType = z.infer<typeof jobLocationTypeSchema>;

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

// Unlike the enums above, `Account.industry` is stored as a plain string in
// the database (see packages/db/prisma/schema.prisma), not a Postgres enum —
// this schema is the single source of truth for which values are valid.
// Adding a new industry later is a one-line addition here plus a matching
// entry in INDUSTRY_PRESETS (./account.js) — no database migration.
export const industrySchema = z.enum(["TRADES", "BEAUTY", "ARTS", "OTHER"]);
export type Industry = z.infer<typeof industrySchema>;
