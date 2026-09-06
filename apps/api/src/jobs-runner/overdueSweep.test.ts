import "../env.js";
import { beforeEach, describe, expect, it } from "vitest";
import { detectOverdue, maybeScheduleOverdueSweep } from "./index.js";
import { prisma } from "../lib/db.js";
import { ensureDevAccount } from "../lib/devAuth.js";

let accountId: string;
let customerId: string;

beforeEach(async () => {
  const account = await ensureDevAccount();
  accountId = account.id;
  const customer = await prisma.customer.create({ data: { accountId, name: "Overdue Sweep Customer" } });
  customerId = customer.id;
  // DETECT_OVERDUE jobs aren't account-scoped (see schema.prisma's note on
  // BackgroundJob.accountId) — clearing them per-test is what makes
  // maybeScheduleOverdueSweep's "is one already due/pending" branches
  // deterministic instead of depending on whatever earlier test runs left
  // behind in the shared test database.
  await prisma.backgroundJob.deleteMany({ where: { type: "DETECT_OVERDUE" } });
});

async function createSentInvoice(dueDate: Date) {
  const job = await prisma.job.create({ data: { accountId, customerId, title: "Overdue sweep test job" } });
  const invoice = await prisma.invoice.create({
    data: {
      accountId,
      jobId: job.id,
      customerId,
      invoiceNumber: `SWEEP-${job.id.slice(0, 8)}`,
      status: "SENT",
      dueDate,
      subtotal: 100,
      taxRate: 0,
      taxAmount: 0,
      total: 100,
    },
  });
  return invoice.id;
}

describe("detectOverdue", () => {
  it("flips overdue on a SENT invoice past its due date, and leaves a not-yet-due one alone", async () => {
    const overdueId = await createSentInvoice(new Date("2020-01-01"));
    const notYetDueId = await createSentInvoice(new Date("2999-01-01"));

    await detectOverdue();

    expect((await prisma.invoice.findUnique({ where: { id: overdueId } }))!.overdue).toBe(true);
    expect((await prisma.invoice.findUnique({ where: { id: notYetDueId } }))!.overdue).toBe(false);
  });
});

describe("maybeScheduleOverdueSweep", () => {
  it("enqueues a DETECT_OVERDUE job when none exists yet", async () => {
    await maybeScheduleOverdueSweep();

    const jobs = await prisma.backgroundJob.findMany({ where: { type: "DETECT_OVERDUE" } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.status).toBe("PENDING");
    expect(jobs[0]!.accountId).toBeNull();
  });

  it("doesn't enqueue a second one while the last is still pending", async () => {
    await maybeScheduleOverdueSweep();
    await maybeScheduleOverdueSweep();

    const jobs = await prisma.backgroundJob.findMany({ where: { type: "DETECT_OVERDUE" } });
    expect(jobs).toHaveLength(1);
  });

  it("doesn't enqueue another if the last sweep succeeded recently", async () => {
    await prisma.backgroundJob.create({
      data: { type: "DETECT_OVERDUE", payload: {}, status: "SUCCEEDED" },
    });

    await maybeScheduleOverdueSweep();

    const jobs = await prisma.backgroundJob.findMany({ where: { type: "DETECT_OVERDUE" } });
    expect(jobs).toHaveLength(1);
  });

  it("enqueues a fresh sweep once the last succeeded run is more than a day old", async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const old = await prisma.backgroundJob.create({
      data: { type: "DETECT_OVERDUE", payload: {}, status: "SUCCEEDED" },
    });
    // createdAt isn't settable via create() (it's @default(now())) — backdate
    // it directly so the "more than a day old" branch is exercised.
    await prisma.backgroundJob.update({ where: { id: old.id }, data: { createdAt: twentyFiveHoursAgo } });

    await maybeScheduleOverdueSweep();

    const jobs = await prisma.backgroundJob.findMany({ where: { type: "DETECT_OVERDUE" } });
    expect(jobs).toHaveLength(2);
    expect(jobs.some((j) => j.status === "PENDING")).toBe(true);
  });
});
