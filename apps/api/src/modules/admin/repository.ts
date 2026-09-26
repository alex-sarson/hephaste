// Every query here goes through adminPrisma() — the hephaste_admin role,
// which can read across accounts (BYPASSRLS) but only holds SELECT on the
// metadata columns listed in the add_admin_role migration. Asking it for
// anything else (a customer's name, a job title, an invoice total) fails
// with "permission denied" at the database, so keep every `select` below
// within those columns. Brief §5: admins see counts and states, never
// content.
import { adminPrisma } from "../../lib/db.js";
import { toEmailSendInfo, type EmailSendInfo } from "../invoices/repository.js";

export async function listAccounts(search?: string) {
  const db = adminPrisma();
  const accounts = await db.account.findMany({
    where: search
      ? {
          OR: [
            { businessName: { contains: search, mode: "insensitive" } },
            { contactEmail: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    select: {
      id: true,
      businessName: true,
      contactEmail: true,
      industry: true,
      createdAt: true,
      deletedAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const ids = accounts.map((a) => a.id);
  const [customers, jobs, invoices] = await Promise.all([
    db.customer.groupBy({
      by: ["accountId"],
      where: { accountId: { in: ids }, deletedAt: null },
      _count: { _all: true },
    }),
    db.job.groupBy({
      by: ["accountId"],
      where: { accountId: { in: ids }, deletedAt: null },
      _count: { _all: true },
    }),
    db.invoice.groupBy({
      by: ["accountId"],
      where: { accountId: { in: ids } },
      _count: { _all: true },
    }),
  ]);
  const countFor = (rows: { accountId: string; _count: { _all: number } }[]) =>
    new Map(rows.map((r) => [r.accountId, r._count._all]));
  const customerCounts = countFor(customers);
  const jobCounts = countFor(jobs);
  const invoiceCounts = countFor(invoices);
  return accounts.map((a) => ({
    ...a,
    customerCount: customerCounts.get(a.id) ?? 0,
    jobCount: jobCounts.get(a.id) ?? 0,
    invoiceCount: invoiceCounts.get(a.id) ?? 0,
  }));
}

/**
 * Counts and states for one account — no content. Viewing it is itself
 * audited (brief §5: "every admin action against tenant data"), written in
 * the same transaction as the reads.
 */
export async function accountSummary(accountId: string, adminId: string) {
  return adminPrisma().$transaction(async (tx) => {
    const account = await tx.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        businessName: true,
        contactEmail: true,
        industry: true,
        currency: true,
        createdAt: true,
        deletedAt: true,
      },
    });
    if (!account) return null;

    const [
      customerCount,
      jobsByStatus,
      invoicesByStatus,
      overdueCount,
      recentInvoices,
      sendJobs,
    ] = await Promise.all([
      tx.customer.count({ where: { accountId, deletedAt: null } }),
      tx.job.groupBy({
        by: ["status"],
        where: { accountId, deletedAt: null },
        _count: { _all: true },
      }),
      tx.invoice.groupBy({
        by: ["status"],
        where: { accountId },
        _count: { _all: true },
      }),
      tx.invoice.count({
        where: { accountId, overdue: true, status: { in: ["SENT", "VIEWED"] } },
      }),
      tx.invoice.findMany({
        where: { accountId },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          overdue: true,
          sentAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      tx.backgroundJob.findMany({
        where: { accountId, type: "SEND_INVOICE_EMAIL" },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

    // Newest send job per invoice (already sorted newest-first).
    const emailByInvoice = new Map<string, EmailSendInfo>();
    for (const job of sendJobs) {
      const invoiceId = (job.payload as { invoiceId?: string } | null)
        ?.invoiceId;
      if (invoiceId && !emailByInvoice.has(invoiceId))
        emailByInvoice.set(invoiceId, toEmailSendInfo(job));
    }

    await tx.adminAuditLog.create({
      data: {
        adminId,
        action: "ACCOUNT_SUMMARY_VIEWED",
        targetAccountId: accountId,
      },
    });

    return {
      account,
      customerCount,
      jobsByStatus: Object.fromEntries(
        jobsByStatus.map((r) => [r.status, r._count._all]),
      ),
      invoicesByStatus: Object.fromEntries(
        invoicesByStatus.map((r) => [r.status, r._count._all]),
      ),
      overdueCount,
      recentInvoices: recentInvoices.map((i) => ({
        ...i,
        email: emailByInvoice.get(i.id) ?? null,
      })),
    };
  });
}

export type ResendResult =
  { ok: true } | { ok: false; code: 404 | 409; error: string };

/**
 * Support action: retry a FAILED invoice email on the account's behalf.
 * Same rules as the tenant-facing POST /invoices/:id/resend-email (only
 * while the last attempt FAILED — see that handler for why a delivered
 * email can't be "resent"), plus an audit row in the same transaction.
 */
export async function resendInvoiceEmail(
  invoiceId: string,
  adminId: string,
): Promise<ResendResult> {
  return adminPrisma().$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, accountId: true, status: true },
    });
    if (!invoice)
      return { ok: false, code: 404, error: "Invoice not found" } as const;
    if (invoice.status === "DRAFT") {
      return {
        ok: false,
        code: 409,
        error: "The account hasn't sent this invoice yet",
      } as const;
    }

    const lastJob = await tx.backgroundJob.findFirst({
      where: {
        accountId: invoice.accountId,
        type: "SEND_INVOICE_EMAIL",
        payload: { path: ["invoiceId"], equals: invoice.id },
      },
      orderBy: { createdAt: "desc" },
    });
    const current = lastJob ? toEmailSendInfo(lastJob) : null;
    if (current && current.status !== "FAILED") {
      return {
        ok: false,
        code: 409,
        error:
          current.status === "SENDING"
            ? "A send is already in progress"
            : "This invoice's email already sent successfully — there's nothing to retry",
      } as const;
    }

    await tx.backgroundJob.create({
      data: {
        accountId: invoice.accountId,
        type: "SEND_INVOICE_EMAIL",
        payload: { invoiceId: invoice.id },
      },
    });
    await tx.adminAuditLog.create({
      data: {
        adminId,
        action: "INVOICE_EMAIL_RESENT",
        targetAccountId: invoice.accountId,
        metadata: { invoiceId: invoice.id },
      },
    });
    return { ok: true } as const;
  });
}

export async function listAuditLogs(limit: number) {
  const db = adminPrisma();
  const logs = await db.adminAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { admin: { select: { email: true } } },
  });
  const targetIds = [
    ...new Set(
      logs.map((l) => l.targetAccountId).filter((id): id is string => !!id),
    ),
  ];
  const targets = await db.account.findMany({
    where: { id: { in: targetIds } },
    select: { id: true, businessName: true },
  });
  const names = new Map(targets.map((t) => [t.id, t.businessName]));
  return logs.map((l) => ({
    id: l.id,
    action: l.action,
    adminEmail: l.admin.email,
    targetAccountId: l.targetAccountId,
    targetBusinessName: l.targetAccountId
      ? (names.get(l.targetAccountId) ?? null)
      : null,
    metadata: l.metadata,
    createdAt: l.createdAt,
  }));
}
