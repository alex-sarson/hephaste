import { Router } from "express";
import { createInvoiceSchema, markInvoicePaidSchema, updateInvoiceSchema } from "@trade-platform/shared-types";
import { renderInvoicePdf } from "@trade-platform/pdf";
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
  res.json(invoice);
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
