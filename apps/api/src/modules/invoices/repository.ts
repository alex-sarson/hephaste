// Follows the reference pattern in ../customers/repository.ts (brief §7.2).
// Every status change here MUST go through transition() — never
// `prisma.invoice.update({ data: { status } })` directly — so an
// InvoiceStatusEvent row is always written in the same transaction (brief
// §4, packages/invoice-engine/src/stateMachine.ts).
import type {
  EmailSendStatus,
  InvoiceLineItemInput,
  InvoiceStatus,
  MarkInvoicePaidInput,
  TriggerSource,
  UpdateInvoiceInput,
} from "@trade-platform/shared-types";
import { assertValidTransition, calculateInvoiceTotals, isOverdue } from "@trade-platform/invoice-engine";
import { prisma } from "../../lib/db.js";

const detailInclude = {
  customer: {
    select: { id: true, name: true, email: true, phone: true, addressLine1: true, addressLine2: true, city: true, postcode: true },
  },
  job: { select: { id: true, title: true } },
  lineItems: { orderBy: { sortOrder: "asc" as const } },
  statusEvents: { orderBy: { createdAt: "asc" as const } },
};

const listInclude = {
  customer: { select: { id: true, name: true } },
  job: { select: { id: true, title: true } },
};

// `overdue` is computed live from the pure isOverdue() function rather than
// trusted from the stored column, since the daily sweep that's meant to
// keep that column current (brief §4, §10) doesn't exist yet — this gives
// accurate badges now without waiting on that background job. Once the
// sweep lands, the stored column becomes authoritative and this can be
// simplified back to reading it directly.
function withComputedOverdue<T extends { status: InvoiceStatus; dueDate: Date | null }>(invoice: T): T & { overdue: boolean } {
  return { ...invoice, overdue: isOverdue(invoice.status, invoice.dueDate) };
}

export async function findMany(accountId: string) {
  const invoices = await prisma.invoice.findMany({
    where: { accountId },
    include: listInclude,
    orderBy: { createdAt: "desc" },
  });
  return invoices.map(withComputedOverdue);
}

export async function findById(accountId: string, id: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id, accountId },
    include: detailInclude,
  });
  return invoice ? withComputedOverdue(invoice) : null;
}

export interface EmailSendInfo {
  status: EmailSendStatus;
  lastError: string | null;
  updatedAt: Date;
}

/**
 * The async outcome of the most recent SEND_INVOICE_EMAIL background job
 * for this invoice — see EmailSendStatus. Null means no send has ever been
 * attempted (still DRAFT). BackgroundJob.payload is a Json column with no
 * direct invoiceId relation, so this is a JSON-path filter rather than a
 * join — fine at this scale, and simpler than adding a column solely to
 * index a lookup the UI only ever makes one at a time (the invoice detail
 * page), not in bulk.
 */
export async function getEmailSendStatus(accountId: string, invoiceId: string): Promise<EmailSendInfo | null> {
  const job = await prisma.backgroundJob.findFirst({
    where: {
      accountId,
      type: "SEND_INVOICE_EMAIL",
      payload: { path: ["invoiceId"], equals: invoiceId },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!job) return null;

  const status: EmailSendStatus = job.status === "FAILED" ? "FAILED" : job.status === "SUCCEEDED" ? "SENT" : "SENDING";
  return { status, lastError: status === "FAILED" ? job.lastError : null, updatedAt: job.updatedAt };
}

/**
 * Creates a DRAFT invoice for a job, pre-filling line items from the job's
 * materials (brief §3: "JobMaterial ... feeding into an invoice's
 * pre-filled line items") — still fully editable afterward via update().
 * Returns null if the job doesn't belong to this account.
 */
export async function create(accountId: string, jobId: string) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findFirst({
      where: { id: jobId, accountId, deletedAt: null },
      select: { customerId: true, materials: true },
    });
    if (!job) return null;

    // Atomic increment — safe against concurrent invoice creation for the
    // same account without a separate locking scheme.
    const account = await tx.account.update({
      where: { id: accountId },
      data: { invoiceNumberSeq: { increment: 1 } },
      select: { invoiceNumberPrefix: true, invoiceNumberSeq: true, defaultTaxRate: true },
    });
    const invoiceNumber = `${account.invoiceNumberPrefix}${String(account.invoiceNumberSeq).padStart(4, "0")}`;
    const taxRate = Number(account.defaultTaxRate);

    const lineItemsInput: InvoiceLineItemInput[] = job.materials.map((material, i) => ({
      description: material.description,
      type: "MATERIALS",
      quantity: Number(material.quantity),
      unitPrice: Number(material.unitCost),
      sortOrder: i,
    }));
    const totals = calculateInvoiceTotals(lineItemsInput, taxRate);

    const invoice = await tx.invoice.create({
      data: {
        accountId,
        jobId,
        customerId: job.customerId,
        invoiceNumber,
        status: "DRAFT",
        taxRate,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        total: totals.total,
        lineItems: { createMany: { data: lineItemsInput.map((li) => ({ ...li, accountId, lineTotal: li.quantity * li.unitPrice })) } },
      },
      include: detailInclude,
    });
    await tx.invoiceStatusEvent.create({
      data: { invoiceId: invoice.id, accountId, fromStatus: null, toStatus: "DRAFT", triggeredBy: "MANUAL_USER", actorId: accountId },
    });
    return withComputedOverdue(invoice);
  });
}

type UpdateResult = { outcome: "not_found" } | { outcome: "not_draft" } | { outcome: "ok"; invoice: Awaited<ReturnType<typeof findById>> };

/** Only permitted while status = DRAFT — see shared-types' updateInvoiceSchema comment. */
export async function update(accountId: string, id: string, input: UpdateInvoiceInput): Promise<UpdateResult> {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({ where: { id, accountId } });
    if (!invoice) return { outcome: "not_found" };
    if (invoice.status !== "DRAFT") return { outcome: "not_draft" };

    const taxRate = input.taxRate ?? Number(invoice.taxRate);

    let lineItemsForTotals: InvoiceLineItemInput[];
    if (input.lineItems) {
      await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceLineItem.createMany({
        data: input.lineItems.map((li) => ({ ...li, invoiceId: id, accountId, lineTotal: li.quantity * li.unitPrice })),
      });
      lineItemsForTotals = input.lineItems;
    } else {
      const existing = await tx.invoiceLineItem.findMany({ where: { invoiceId: id } });
      lineItemsForTotals = existing.map((li) => ({
        description: li.description,
        type: li.type,
        quantity: Number(li.quantity),
        unitPrice: Number(li.unitPrice),
        sortOrder: li.sortOrder,
      }));
    }
    const totals = calculateInvoiceTotals(lineItemsForTotals, taxRate);

    await tx.invoice.update({
      where: { id },
      data: {
        dueDate: input.dueDate,
        notesToCustomer: input.notesToCustomer,
        taxRate,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        total: totals.total,
      },
    });
    const updated = await tx.invoice.findFirst({ where: { id, accountId }, include: detailInclude });
    return { outcome: "ok", invoice: updated ? withComputedOverdue(updated) : null };
  });
}

/**
 * The one place Invoice.status changes — validates the edge via
 * assertValidTransition() (throws InvalidInvoiceTransitionError, mapped to
 * 409 by errorHandler.ts) and always writes the matching status event in
 * the same transaction. Returns null if the invoice doesn't belong to this
 * account.
 */
export async function transition(
  accountId: string,
  id: string,
  toStatus: InvoiceStatus,
  triggeredBy: TriggerSource,
  extra?: MarkInvoicePaidInput,
) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({ where: { id, accountId } });
    if (!invoice) return null;

    assertValidTransition(invoice.status, toStatus, triggeredBy);

    const data: Record<string, unknown> = { status: toStatus };
    if (toStatus === "SENT") data.sentAt = new Date();
    if (toStatus === "PAID") {
      data.paidAt = extra?.paidAt ?? new Date();
      data.amountPaid = extra?.amountPaid;
      data.paidMethod = extra?.paidMethod;
    }
    if (toStatus === "VOID") data.voidedAt = new Date();

    await tx.invoice.update({ where: { id }, data });
    await tx.invoiceStatusEvent.create({
      data: { invoiceId: id, accountId, fromStatus: invoice.status, toStatus, triggeredBy, actorId: accountId },
    });
    const updated = await tx.invoice.findFirst({ where: { id, accountId }, include: detailInclude });
    return updated ? withComputedOverdue(updated) : null;
  });
}
