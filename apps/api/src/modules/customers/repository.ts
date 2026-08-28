// Reference implementation of the repository-layer pattern described in
// brief §7.2: every function takes `accountId` as a mandatory first
// argument and filters on it explicitly. No route handler in this module
// calls `prisma.customer.*` directly — that's the whole point: forgetting
// the accountId filter becomes a type error, not a silent data leak.
//
// Other modules (jobs, invoices — Phase 1) should follow this same shape.
import type { CreateCustomerInput, UpdateCustomerInput } from "@trade-platform/shared-types";
import { prisma } from "../../lib/db.js";

export function findMany(accountId: string) {
  return prisma.customer.findMany({
    where: { accountId, deletedAt: null },
    orderBy: { name: "asc" },
  });
}

export function findById(accountId: string, id: string) {
  return prisma.customer.findFirst({
    where: { id, accountId, deletedAt: null },
  });
}

export function create(accountId: string, input: CreateCustomerInput) {
  return prisma.customer.create({
    data: { ...input, accountId },
  });
}

export async function update(accountId: string, id: string, input: UpdateCustomerInput) {
  // updateMany + count check (rather than update-by-id) means an attempt to
  // update another tenant's customer silently affects zero rows instead of
  // throwing a Prisma "record not found" that could hint at existence.
  const result = await prisma.customer.updateMany({
    where: { id, accountId, deletedAt: null },
    data: input,
  });
  return result.count > 0;
}

export async function softDelete(accountId: string, id: string) {
  const result = await prisma.customer.updateMany({
    where: { id, accountId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count > 0;
}
