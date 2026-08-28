import { Router } from "express";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { prisma } from "../../lib/db.js";

// All routes here are metadata-only by design — see brief §5. None of these
// handlers read job/customer/invoice content; that requires the explicit,
// logged break-glass impersonation flow (Phase 1 — not scaffolded yet).
export const adminRouter = Router();

adminRouter.use(requireAdmin);

adminRouter.get("/accounts", async (_req, res) => {
  const accounts = await prisma.account.findMany({
    select: {
      id: true,
      businessName: true,
      contactEmail: true,
      createdAt: true,
      deletedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(accounts);
});

// TODO (Phase 1): GET /accounts/:id/summary (job/invoice counts, no content),
// POST /accounts/:id/impersonate-grant (logged, time-boxed — see brief §5.1),
// POST /support/resend-invoice-email. Every write here must insert an
// AdminAuditLog row in the same transaction.
