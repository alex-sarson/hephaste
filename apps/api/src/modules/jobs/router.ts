import { Router } from "express";
import { resolveAccount } from "../../middleware/tenantScope.js";

// Phase 1 (brief §13, build order item 3): jobs CRUD + status pipeline +
// materials + attachments. Follow the same repository pattern as
// ../customers/repository.ts — every query takes accountId first.
export const jobsRouter = Router();

jobsRouter.use(resolveAccount);

jobsRouter.get("/", (_req, res) => {
  res.status(501).json({ error: "Not implemented — Phase 1" });
});
