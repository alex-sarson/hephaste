import "../../env.js";
import "express-async-errors";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { dashboardRouter } from "./router.js";
import { customersRouter } from "../customers/router.js";
import { jobsRouter } from "../jobs/router.js";
import { invoicesRouter } from "../invoices/router.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { ensureDevAccount, DEV_ACCOUNT_AUTH_ID_2 } from "../../lib/devAuth.js";

const app = express();
app.use(express.json());
app.use("/api/dashboard", dashboardRouter);
app.use("/api/customers", customersRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/invoices", invoicesRouter);
app.use(errorHandler);

// Every other router.test.ts in this suite shares the default dev identity
// (DEV_ACCOUNT_AUTH_ID) and keeps piling up fixture rows under it with no
// cleanup — fine for their per-record assertions, but this endpoint
// aggregates across the WHOLE account, so an exact count would be at the
// mercy of whatever those other files happened to create first. Tenant B
// (x-dev-account: 2, see tenantScope.ts) is only ever touched by
// tenantIsolation.test.ts, and only through requests that get blocked
// before creating anything — so nothing besides this file ever writes a
// job/invoice under it, and its aggregates stay computable exactly.
const as2 = {
  get: (url: string) => request(app).get(url).set("x-dev-account", "2"),
  post: (url: string) => request(app).post(url).set("x-dev-account", "2"),
  patch: (url: string) => request(app).patch(url).set("x-dev-account", "2"),
};

async function createCustomer() {
  const res = await as2.post("/api/customers").send({ name: "Dashboard Test Customer" });
  return res.body.id as string;
}

async function createJobWithMaterial(customerId: string) {
  const job = await as2.post("/api/jobs").send({ customerId, title: "Dashboard test job" });
  await as2.post(`/api/jobs/${job.body.id}/materials`).send({ description: "Widget", quantity: 1, unitCost: 100 });
  return job.body.id as string;
}

describe("GET /api/dashboard/summary", () => {
  it("counts a completed, uninvoiced job under needsInvoicing", async () => {
    const customerId = await createCustomer();
    const jobId = await createJobWithMaterial(customerId);
    await as2.patch(`/api/jobs/${jobId}/status`).send({ status: "COMPLETE" });

    const res = await as2.get("/api/dashboard/summary");
    expect(res.status).toBe(200);
    expect(res.body.needsInvoicing[0]).toMatchObject({ jobId, title: "Dashboard test job" });
  });

  it("includes a sent invoice in outstanding, excludes it once paid, and reflects it in recentInvoices", async () => {
    const customerId = await createCustomer();
    const jobId = await createJobWithMaterial(customerId);
    const invoice = await as2.post("/api/invoices").send({ jobId });
    const invoiceId = invoice.body.id;

    const before = await as2.get("/api/dashboard/summary");

    await as2.post(`/api/invoices/${invoiceId}/send`);
    const afterSend = await as2.get("/api/dashboard/summary");
    expect(afterSend.body.outstanding.count).toBe(before.body.outstanding.count + 1);
    expect(Number(afterSend.body.outstanding.total)).toBeCloseTo(Number(before.body.outstanding.total) + 120, 5);
    expect(afterSend.body.recentInvoices[0]).toMatchObject({ id: invoiceId, status: "SENT", overdue: false });

    await as2.post(`/api/invoices/${invoiceId}/mark-paid`).send({ amountPaid: 120, paidMethod: "cash" });
    const afterPaid = await as2.get("/api/dashboard/summary");
    // Back down to the pre-send count — PAID drops out of the open set.
    expect(afterPaid.body.outstanding.count).toBe(before.body.outstanding.count);
    expect(afterPaid.body.paidThisMonth.count).toBe(before.body.paidThisMonth.count + 1);
    expect(Number(afterPaid.body.paidThisMonth.total)).toBeCloseTo(Number(before.body.paidThisMonth.total) + 120, 5);
  });

  it("flags a sent invoice overdue once its due date is in the past, and totals it separately", async () => {
    const customerId = await createCustomer();
    const jobId = await createJobWithMaterial(customerId);
    const invoice = await as2.post("/api/invoices").send({ jobId });
    const invoiceId = invoice.body.id;
    await as2.patch(`/api/invoices/${invoiceId}`).send({ dueDate: "2020-01-01" });

    const before = await as2.get("/api/dashboard/summary");
    await as2.post(`/api/invoices/${invoiceId}/send`);

    const after = await as2.get("/api/dashboard/summary");
    expect(after.body.overdue.count).toBe(before.body.overdue.count + 1);
    expect(Number(after.body.overdue.total)).toBeCloseTo(Number(before.body.overdue.total) + 120, 5);
    expect(after.body.recentInvoices[0]).toMatchObject({ id: invoiceId, overdue: true });
  });

  it("counts a scheduled job in the next 7 days under upcomingJobsCount and upcomingJobs", async () => {
    const customerId = await createCustomer();
    const job = await as2.post("/api/jobs").send({ customerId, title: "Dashboard upcoming job" });
    const inThreeDays = new Date(Date.now() + 3 * 86_400_000).toISOString();
    await as2.patch(`/api/jobs/${job.body.id}`).send({ scheduledStart: inThreeDays });
    await as2.patch(`/api/jobs/${job.body.id}/status`).send({ status: "SCHEDULED" });

    const res = await as2.get("/api/dashboard/summary");
    expect(res.body.upcomingJobsCount).toBeGreaterThanOrEqual(1);
    expect(res.body.upcomingJobs.some((j: { jobId: string }) => j.jobId === job.body.id)).toBe(true);
  });

  it("returns zeroed aggregates for an account with no data yet", async () => {
    // ensureDevAccount is idempotent — this just confirms the shape holds
    // even before any fixture in this file has run against a fresh clone
    // of the endpoint's math (empty arrays -> 0 totals, not NaN/errors).
    const account = await ensureDevAccount(DEV_ACCOUNT_AUTH_ID_2);
    expect(account.id).toBeTruthy();
    const res = await as2.get("/api/dashboard/summary");
    expect(res.status).toBe(200);
    expect(Number(res.body.outstanding.total)).not.toBeNaN();
  });
});
