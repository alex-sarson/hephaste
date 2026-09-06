import { Router } from "express";
import { createInvoiceSchema, markInvoicePaidSchema, updateInvoiceSchema } from "@hephaste/shared-types";
import { renderInvoicePdf } from "@hephaste/pdf";
import { resolveAccount } from "../../middleware/tenantScope.js";
import { prisma } from "../../lib/db.js";
import * as invoicesRepo from "./repository.js";
import { buildInvoicePdfData } from "./pdfData.js";

// Follows the reference pattern in ../customers/router.ts (brief §7.2).
// Route shape matches docs/PROJECT_PLAN.md §8: /api/invoices + /send,
// /mark-paid, /void (no DELETE — invoices are financial records; VOID is
// the only way to retire one). /pdf is a later checkpoint.
export const invoicesRouter = Router();

invoicesRouter.use(resolveAccount);

invoicesRouter.get("/", async (req, res) => {
  const invoices = await invoicesRepo.findMany(req.accountId!);
  res.json(invoices);
});

invoicesRouter.post("/", async (req, res) => {
  const { jobId } = createInvoiceSchema.parse(req.body);
  const invoice = await invoicesRepo.create(req.accountId!, jobId);
  if (!invoice) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.status(201).json(invoice);
});

invoicesRouter.get("/:id", async (req, res) => {
  const invoice = await invoicesRepo.findById(req.accountId!, req.params.id);
  if (!invoice) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  const emailSend = await invoicesRepo.getEmailSendStatus(req.accountId!, invoice.id);
  res.json({ ...invoice, emailSend });
});

invoicesRouter.patch("/:id", async (req, res) => {
  const input = updateInvoiceSchema.parse(req.body);
  const result = await invoicesRepo.update(req.accountId!, req.params.id, input);
  if (result.outcome === "not_found") {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  if (result.outcome === "not_draft") {
    res.status(409).json({ error: "Only a draft invoice can be edited" });
    return;
  }
  res.json(result.invoice);
});

invoicesRouter.post("/:id/send", async (req, res) => {
  const existing = await invoicesRepo.findById(req.accountId!, req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  if (existing.lineItems.length === 0) {
    res.status(409).json({ error: "Add at least one line item before sending" });
    return;
  }
  // The status transition itself is cheap and happens synchronously here
  // (also what makes the "send again" 409 test meaningful) — it's the
  // slow/failure-prone part (render a PDF, call an external API) that
  // brief §9 wants off the request path. That part runs in the
  // jobs-runner (see src/jobs-runner/index.ts's sendInvoiceEmail), kicked
  // off by this enqueue.
  const invoice = await invoicesRepo.transition(req.accountId!, req.params.id, "SENT", "MANUAL_USER");
  await prisma.backgroundJob.create({
    data: { accountId: req.accountId!, type: "SEND_INVOICE_EMAIL", payload: { invoiceId: req.params.id } },
  });
  res.json(invoice);
});

// Manual retry after a failed send (see EmailSendStatus) — enqueues a
// fresh SEND_INVOICE_EMAIL job rather than touching the failed
// BackgroundJob row, matching how a real retry would look once brief
// §10's retry loop exists (attempts/maxAttempts are tracked per-job, not
// per-invoice).
//
// Only allowed while the last attempt is FAILED (or nothing's been
// attempted at all, defensively — shouldn't happen once status isn't
// DRAFT). Deliberately NOT offered once a send has already SUCCEEDED: a
// fresh job would just hit sendInvoiceEmail's idempotency guard (an
// EmailEvent(SENT) already exists) and silently no-op rather than
// actually re-deliver, so exposing "retry" there would lie about what it
// does. If a customer disputes receiving an invoice, the BCC copy sent to
// the account's own contactEmail at send time (see jobs-runner/index.ts)
// is today's answer, surfaced in the UI next to this status — an
// explicit "force resend even though it already succeeded" would need
// that idempotency guard reworked, which is out of scope here.
invoicesRouter.post("/:id/resend-email", async (req, res) => {
  const existing = await invoicesRepo.findById(req.accountId!, req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  if (existing.status === "DRAFT") {
    res.status(409).json({ error: "Send the invoice before retrying its email" });
    return;
  }
  const current = await invoicesRepo.getEmailSendStatus(req.accountId!, existing.id);
  if (current && current.status !== "FAILED") {
    res.status(409).json({
      error:
        current.status === "SENDING"
          ? "A send is already in progress"
          : "This invoice's email already sent successfully — there's nothing to retry",
    });
    return;
  }
  await prisma.backgroundJob.create({
    data: { accountId: req.accountId!, type: "SEND_INVOICE_EMAIL", payload: { invoiceId: existing.id } },
  });
  res.status(202).json({ ok: true });
});

invoicesRouter.post("/:id/mark-paid", async (req, res) => {
  const input = markInvoicePaidSchema.parse(req.body);
  const invoice = await invoicesRepo.transition(req.accountId!, req.params.id, "PAID", "MANUAL_USER", input);
  if (!invoice) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  res.json(invoice);
});

// Rendered on demand rather than pre-generated and stored — cheap at this
// scale, and sidesteps needing a file-storage decision (S3/R2 credentials)
// before that's actually forced by the send/email checkpoint next. Once
// that lands, this becomes the fallback for a missing/stale pdfUrl rather
// than the only path.
invoicesRouter.get("/:id/pdf", async (req, res) => {
  const invoice = await invoicesRepo.findById(req.accountId!, req.params.id);
  if (!invoice) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  const account = await prisma.account.findUniqueOrThrow({ where: { id: req.accountId! } });
  const buffer = await renderInvoicePdf(buildInvoicePdfData(invoice, account));

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${invoice.invoiceNumber}.pdf"`);
  res.send(buffer);
});

invoicesRouter.post("/:id/void", async (req, res) => {
  const invoice = await invoicesRepo.transition(req.accountId!, req.params.id, "VOID", "MANUAL_USER");
  if (!invoice) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  res.json(invoice);
});
