import { Router } from "express";
import { resolveAccount } from "../../middleware/tenantScope.js";

// Phase 1 (brief §13, build order item 4): invoice creation from a job,
// line-item editing + tax calc (use @trade-platform/invoice-engine for all
// money math and status transitions — never reimplement it here), PDF
// generation, send, mark-paid, void.
export const invoicesRouter = Router();

invoicesRouter.use(resolveAccount);

invoicesRouter.get("/", (_req, res) => {
  res.status(501).json({ error: "Not implemented — Phase 1" });
});
