import { Router } from "express";
import { z } from "zod";
import {
  requireAdmin,
  requireAdminRole,
} from "../../middleware/requireAdmin.js";
import * as adminRepo from "./repository.js";

// All routes here are metadata-only by design — see brief §5. None of these
// handlers read job/customer/invoice content, and the database role behind
// them (hephaste_admin, see lib/db.ts) couldn't even if they tried; that
// requires the explicit, logged break-glass impersonation flow (not built
// yet). Every action that touches an account writes an AdminAuditLog row.
export const adminRouter = Router();

adminRouter.use(requireAdmin);

// The web app calls this to decide whether to show the Admin section at all.
adminRouter.get("/me", (req, res) => {
  res.json({ id: req.adminId, role: req.adminRole });
});

adminRouter.get("/accounts", async (req, res) => {
  const { q } = z
    .object({ q: z.string().trim().max(100).optional() })
    .parse(req.query);
  res.json(await adminRepo.listAccounts(q || undefined));
});

adminRouter.get("/accounts/:id/summary", async (req, res) => {
  const summary = await adminRepo.accountSummary(req.params.id, req.adminId!);
  if (!summary) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  res.json(summary);
});

adminRouter.post("/support/resend-invoice-email", async (req, res) => {
  const { invoiceId } = z
    .object({ invoiceId: z.string().uuid() })
    .parse(req.body);
  const result = await adminRepo.resendInvoiceEmail(invoiceId, req.adminId!);
  if (!result.ok) {
    res.status(result.code).json({ error: result.error });
    return;
  }
  res.status(202).json({ ok: true });
});

// The trail itself is the most sensitive thing on this surface (it names
// which admin looked at which account), so SUPERADMIN only.
adminRouter.get(
  "/audit-logs",
  requireAdminRole("SUPERADMIN"),
  async (req, res) => {
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(200).default(100) })
      .parse(req.query);
    res.json(await adminRepo.listAuditLogs(limit));
  },
);

// Still to do: POST /accounts/:id/impersonate-grant (logged, time-boxed —
// see brief §5.1).
