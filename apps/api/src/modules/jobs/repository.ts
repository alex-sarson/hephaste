// Follows the reference pattern in ../customers/repository.ts (brief §7.2):
// every function takes accountId as a mandatory first argument.
import type {
  CreateJobInput,
  CreateJobMaterialInput,
  JobStatus,
  UpdateJobInput,
} from "@trade-platform/shared-types";
import { prisma } from "../../lib/db.js";

const customerSelect = { customer: { select: { id: true, name: true } } } as const;

export function findMany(accountId: string) {
  return prisma.job.findMany({
    where: { accountId, deletedAt: null },
    include: customerSelect,
    orderBy: { createdAt: "desc" },
  });
}

export function findById(accountId: string, id: string) {
  return prisma.job.findFirst({
    where: { id, accountId, deletedAt: null },
    include: { ...customerSelect, materials: { orderBy: { createdAt: "asc" } } },
  });
}

export async function create(accountId: string, input: CreateJobInput) {
  // Without this check, `input.customerId` is trusted as-is — a caller
  // could create a job under their own accountId that points at another
  // tenant's customer, and every subsequent fetch of that job would
  // happily join and return that customer's name/email/phone. Caught by
  // src/tenantIsolation.test.ts.
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, accountId, deletedAt: null },
    select: { id: true },
  });
  if (!customer) return null;

  return prisma.job.create({
    data: { ...input, accountId },
    include: customerSelect,
  });
}

export async function update(accountId: string, id: string, input: UpdateJobInput) {
  // updateMany + count check, not update-by-id — see repository.ts's note
  // in ../customers for why (avoids leaking existence via a thrown error).
  const result = await prisma.job.updateMany({
    where: { id, accountId, deletedAt: null },
    data: input,
  });
  return result.count > 0;
}

export async function updateStatus(accountId: string, id: string, status: JobStatus) {
  const result = await prisma.job.updateMany({
    where: { id, accountId, deletedAt: null },
    data: {
      status,
      // Stamped automatically so "completed but not yet invoiced" (brief
      // §6 dashboard) has something to filter/sort on without the caller
      // having to pass it explicitly.
      completedAt: status === "COMPLETE" ? new Date() : null,
    },
  });
  return result.count > 0;
}

export async function softDelete(accountId: string, id: string) {
  const result = await prisma.job.updateMany({
    where: { id, accountId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count > 0;
}

// --- Materials (brief §3, JobMaterial) ---------------------------------

export async function addMaterial(accountId: string, jobId: string, input: CreateJobMaterialInput) {
  // Confirms the job belongs to this account first — otherwise a crafted
  // jobId for another tenant's job would silently attach a material to it
  // (JobMaterial.create doesn't filter on accountId the way updateMany
  // does, since there's no existing row to scope the write to).
  const job = await prisma.job.findFirst({ where: { id: jobId, accountId, deletedAt: null }, select: { id: true } });
  if (!job) return null;
  return prisma.jobMaterial.create({
    data: { ...input, jobId, accountId },
  });
}

export async function removeMaterial(accountId: string, jobId: string, materialId: string) {
  const result = await prisma.jobMaterial.deleteMany({
    where: { id: materialId, jobId, accountId },
  });
  return result.count > 0;
}
