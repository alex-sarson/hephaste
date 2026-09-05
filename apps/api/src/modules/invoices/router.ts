import { Router } from "express";
import { createInvoiceSchema, markInvoicePaidSchema, updateInvoiceSchema } from "@trade-platform/shared-types";
import { resolveAccount } from "../../middleware/tenantScope.js";
import * as invoicesRepo from "./repository.js";

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
  // Real send (PDF render + Postmark) is a later checkpoint — for now this
  // is the DRAFT -> SENT transition on its own.
  const invoice = await invoicesRepo.transition(req.accountId!, req.params.id, "SENT", "MANUAL_USER");
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

invoicesRouter.post("/:id/void", async (req, res) => {
  const invoice = await invoicesRepo.transition(req.accountId!, req.params.id, "VOID", "MANUAL_USER");
  if (!invoice) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  res.json(invoice);
});
