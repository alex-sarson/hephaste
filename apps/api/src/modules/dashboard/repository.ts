// Powers GET /api/dashboard/summary (brief §6, §13) — the numbers behind
// the dashboard's stat cards, "needs invoicing"/"upcoming jobs" lists, and
// recent-invoices table. Read-only and account-scoped like every other
// repository (brief §7.2), but deliberately has no findById/create/etc. —
// this is a single aggregate view, not a CRUD resource.
import type { InvoiceStatus, JobStatus } from "@hephaste/shared-types";
import { isOverdue } from "@hephaste/invoice-engine";
import { prisma } from "../../lib/db.js";

// Not `as const` — Prisma's `{ in: [...] }` filter wants a mutable array,
// and a readonly tuple isn't assignable to it.
const OPEN_INVOICE_STATUSES: InvoiceStatus[] = ["SENT", "VIEWED"];
const ACTIVE_JOB_STATUSES: JobStatus[] = ["SCHEDULED", "IN_PROGRESS"];

// Same integer-cents approach as packages/invoice-engine/src/totals.ts, for
// the same reason: summing Decimal-derived numbers as floats risks classic
// drift (0.1 + 0.2 !== 0.3). Inputs here already have <=2 decimal places
// (DB columns are Decimal(10,2)), so this round-trips exactly.
function sumToFixed2(amounts: Array<{ toNumber(): number } | number>): string {
  const cents = amounts.reduce((sum: number, a) => sum + Math.round((typeof a === "number" ? a : a.toNumber()) * 100), 0);
  return (cents / 100).toFixed(2);
}

export async function getSummary(accountId: string) {
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [openInvoices, paidThisMonth, needsInvoicingJobs, upcomingJobsRaw, recentInvoicesRaw, upcomingJobsCount] = await Promise.all([
    // Outstanding/overdue totals — computed live from status+dueDate via
    // isOverdue() rather than trusting Invoice.overdue, same reasoning as
    // ../invoices/repository.ts's withComputedOverdue: the daily sweep that
    // would keep that column current isn't scheduled yet.
    prisma.invoice.findMany({
      where: { accountId, status: { in: OPEN_INVOICE_STATUSES } },
      select: { total: true, status: true, dueDate: true },
    }),
    prisma.invoice.aggregate({
      where: { accountId, status: "PAID", paidAt: { gte: startOfMonth, lt: startOfNextMonth } },
      _sum: { amountPaid: true },
      _count: true,
    }),
    // Completed work with no invoice yet at all — brief §6's "completed-but
    // -not-yet-invoiced jobs". A job can carry more than one invoice (see
    // schema.prisma's note on Invoice.jobId), so "none" is the right test,
    // not "no invoice in a particular status".
    prisma.job.findMany({
      where: { accountId, deletedAt: null, status: "COMPLETE", invoices: { none: {} } },
      select: { id: true, title: true, completedAt: true, customer: { select: { name: true } } },
      orderBy: { completedAt: "desc" },
      take: 5,
    }),
    prisma.job.findMany({
      where: { accountId, deletedAt: null, status: { in: ACTIVE_JOB_STATUSES }, scheduledStart: { gte: now } },
      select: { id: true, title: true, scheduledStart: true, customer: { select: { name: true } } },
      orderBy: { scheduledStart: "asc" },
      take: 5,
    }),
    prisma.invoice.findMany({
      where: { accountId },
      select: {
        id: true,
        invoiceNumber: true,
        total: true,
        dueDate: true,
        status: true,
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.job.count({
      where: {
        accountId,
        deletedAt: null,
        status: { in: ACTIVE_JOB_STATUSES },
        scheduledStart: { gte: now, lt: sevenDaysFromNow },
      },
    }),
  ]);

  const overdueInvoices = openInvoices.filter((inv) => isOverdue(inv.status, inv.dueDate));

  return {
    outstanding: { total: sumToFixed2(openInvoices.map((i) => i.total)), count: openInvoices.length },
    overdue: { total: sumToFixed2(overdueInvoices.map((i) => i.total)), count: overdueInvoices.length },
    upcomingJobsCount,
    paidThisMonth: {
      total: sumToFixed2([paidThisMonth._sum.amountPaid ?? 0]),
      count: paidThisMonth._count,
    },
    needsInvoicing: needsInvoicingJobs.map((job) => ({
      jobId: job.id,
      title: job.title,
      customerName: job.customer.name,
      completedAt: job.completedAt,
    })),
    upcomingJobs: upcomingJobsRaw.map((job) => ({
      jobId: job.id,
      title: job.title,
      customerName: job.customer.name,
      scheduledStart: job.scheduledStart,
    })),
    recentInvoices: recentInvoicesRaw.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customer.name,
      total: invoice.total.toString(),
      dueDate: invoice.dueDate,
      status: invoice.status,
      overdue: isOverdue(invoice.status, invoice.dueDate),
    })),
  };
}
