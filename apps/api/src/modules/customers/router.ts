import { Router } from "express";
import { createCustomerSchema, updateCustomerSchema } from "@trade-platform/shared-types";
import { resolveAccount } from "../../middleware/tenantScope.js";
import * as customersRepo from "./repository.js";

export const customersRouter = Router();

customersRouter.use(resolveAccount);

customersRouter.get("/", async (req, res) => {
  const customers = await customersRepo.findMany(req.accountId!);
  res.json(customers);
});

customersRouter.post("/", async (req, res) => {
  const input = createCustomerSchema.parse(req.body);
  const customer = await customersRepo.create(req.accountId!, input);
  res.status(201).json(customer);
});

customersRouter.get("/:id", async (req, res) => {
  const customer = await customersRepo.findById(req.accountId!, req.params.id);
  if (!customer) {
    // 404, not 403 — never confirm whether a resource exists for another
    // tenant. See brief §7.
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json(customer);
});

customersRouter.patch("/:id", async (req, res) => {
  const input = updateCustomerSchema.parse(req.body);
  const updated = await customersRepo.update(req.accountId!, req.params.id, input);
  if (!updated) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.status(204).end();
});

customersRouter.delete("/:id", async (req, res) => {
  const deleted = await customersRepo.softDelete(req.accountId!, req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.status(204).end();
});
