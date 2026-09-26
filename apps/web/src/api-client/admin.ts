// Client for the admin console's API (apps/api/src/modules/admin) — a
// separate, metadata-only surface authenticated as an Admin identity, not
// an Account. Nothing here ever returns customer/job/invoice content.
import type { InvoiceStatus, JobStatus } from "@hephaste/shared-types";
import { request } from "./client.js";

export type AdminRole = "SUPPORT" | "BILLING_OPS" | "SUPERADMIN";

export interface AdminIdentity {
  id: string;
  role: AdminRole;
}

export interface AdminAccountRow {
  id: string;
  businessName: string;
  contactEmail: string;
  industry: string;
  createdAt: string;
  deletedAt: string | null;
  customerCount: number;
  jobCount: number;
  invoiceCount: number;
}

export type EmailSendStatus = "SENDING" | "SENT" | "FAILED";

export interface AdminInvoiceRow {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  overdue: boolean;
  sentAt: string | null;
  createdAt: string;
  email: {
    status: EmailSendStatus;
    lastError: string | null;
    updatedAt: string;
  } | null;
}

export interface AdminAccountSummary {
  account: {
    id: string;
    businessName: string;
    contactEmail: string;
    industry: string;
    currency: string;
    createdAt: string;
    deletedAt: string | null;
  };
  customerCount: number;
  jobsByStatus: Partial<Record<JobStatus, number>>;
  invoicesByStatus: Partial<Record<InvoiceStatus, number>>;
  overdueCount: number;
  recentInvoices: AdminInvoiceRow[];
}

export interface AdminAuditEntry {
  id: string;
  action: string;
  adminEmail: string;
  targetAccountId: string | null;
  targetBusinessName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export function getAdminIdentity(token: string) {
  return request<AdminIdentity>("/admin/me", { method: "GET", token });
}

export function listAdminAccounts(token: string, search: string) {
  const qs = search ? `?q=${encodeURIComponent(search)}` : "";
  return request<AdminAccountRow[]>(`/admin/accounts${qs}`, {
    method: "GET",
    token,
  });
}

export function getAdminAccountSummary(token: string, accountId: string) {
  return request<AdminAccountSummary>(`/admin/accounts/${accountId}/summary`, {
    method: "GET",
    token,
  });
}

export function resendInvoiceEmailAsAdmin(token: string, invoiceId: string) {
  return request<{ ok: true }>("/admin/support/resend-invoice-email", {
    method: "POST",
    token,
    body: JSON.stringify({ invoiceId }),
  });
}

export function listAdminAuditLogs(token: string) {
  return request<AdminAuditEntry[]>("/admin/audit-logs", {
    method: "GET",
    token,
  });
}
