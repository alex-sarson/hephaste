import { Router } from "express";
import {
  createJobMaterialSchema,
  createJobSchema,
  updateJobSchema,
  updateJobStatusSchema,
} from "@hephaste/shared-types";
import { resolveAccount } from "../../middleware/tenantScope.js";
import * as jobsRepo from "./repository.js";

// Follows the reference pattern in ../customers/router.ts (brief §7.2).
export const jobsRouter = Router();

jobsRouter.use(resolveAccount);

jobsRouter.get("/", async (req, res) => {
  const jobs = await jobsRepo.findMany(req.accountId!);
  res.json(jobs);
});

jobsRouter.post("/", async (req, res) => {
  const input = createJobSchema.parse(req.body);
  const job = await jobsRepo.create(req.accountId!, input);
  if (!job) {
    // 404, not 403/400 — see brief §7: never confirm whether a resource
    // exists for another tenant, even indirectly via a referenced id.
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.status(201).json(job);
});

jobsRouter.get("/:id", async (req, res) => {
  const job = await jobsRepo.findById(req.accountId!, req.params.id);
  if (!job) {
    // 404, not 403 — see brief §7.
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

jobsRouter.patch("/:id", async (req, res) => {
  const input = updateJobSchema.parse(req.body);
  const updated = await jobsRepo.update(req.accountId!, req.params.id, input);
  if (!updated) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.status(204).end();
});

jobsRouter.patch("/:id/status", async (req, res) => {
  const { status } = updateJobStatusSchema.parse(req.body);
  const updated = await jobsRepo.updateStatus(req.accountId!, req.params.id, status);
  if (!updated) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.status(204).end();
});

jobsRouter.delete("/:id", async (req, res) => {
  const deleted = await jobsRepo.softDelete(req.accountId!, req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.status(204).end();
});

jobsRouter.post("/:id/materials", async (req, res) => {
  const input = createJobMaterialSchema.parse(req.body);
  const material = await jobsRepo.addMaterial(req.accountId!, req.params.id, input);
  if (!material) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.status(201).json(material);
});

jobsRouter.delete("/:id/materials/:materialId", async (req, res) => {
  const removed = await jobsRepo.removeMaterial(req.accountId!, req.params.id, req.params.materialId);
  if (!removed) {
    res.status(404).json({ error: "Material not found" });
    return;
  }
  res.status(204).end();
});
