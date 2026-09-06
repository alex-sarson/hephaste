import { Router } from "express";
import { resolveAccount } from "../../middleware/tenantScope.js";
import * as dashboardRepo from "./repository.js";

// Single read-only endpoint — see repository.ts for the aggregate query
// this composes. Mounted at /api/dashboard (brief §8).
export const dashboardRouter = Router();

dashboardRouter.use(resolveAccount);

dashboardRouter.get("/summary", async (req, res) => {
  const summary = await dashboardRepo.getSummary(req.accountId!);
  res.json(summary);
});
