import type { InvoiceStatus } from "@trade-platform/shared-types";
import { request } from "./client.js";

export interface DashboardSummary {
  outstanding: { total: string; count: number };
  overdue: { total: string; count: number };
  upcomingJobsCount: number;
  paidThisMonth: { total: string; count: number };
  needsInvoicing: Array<{ jobId: string; title: string; customerName: string; completedAt: string | null }>;
  upcomingJobs: Array<{ jobId: string; title: string; customerName: string; scheduledStart: string | null }>;
  recentInvoices: Array<{
    id: string;
    invoiceNumber: string;
    customerName: string;
    total: string;
    dueDate: string | null;
    status: InvoiceStatus;
    overdue: boolean;
  }>;
}

export function getDashboardSummary(token: string) {
  return request<DashboardSummary>("/api/dashboard/summary", { method: "GET", token });
}
