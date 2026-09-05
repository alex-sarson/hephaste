// Dedicated cross-account isolation tests (brief §7): "fetching another
// account's resource by ID returns 404 (not 403, to avoid confirming
// existence)". Uses the dev-auth bypass's second fixed identity (see
// lib/devAuth.ts, tenantScope.ts's `x-dev-account: 2` header) to exercise
// two genuinely different accounts through the real router/middleware
// chain — not a repository-layer unit test, so a bug in a route handler
// itself (not just the repository function it calls) would be caught too.
//
// This only tests the app layer (accountId-scoped repository functions).
// The DB-layer backstop (Postgres RLS) described alongside it in brief §7
// doesn't exist yet — see docs/PROJECT_PLAN.md.
import "./env.js";
import "express-async-errors";
import express from "express";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { customersRouter } from "./modules/customers/router.js";
import { jobsRouter } from "./modules/jobs/router.js";
import { invoicesRouter } from "./modules/invoices/router.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { DEV_ACCOUNT_AUTH_ID, DEV_ACCOUNT_AUTH_ID_2, ensureDevAccount } from "./lib/devAuth.js";

const app = express();
app.use(express.json());
app.use("/api/customers", customersRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/invoices", invoicesRouter);
app.use(errorHandler);

// Tenant A is the default dev identity (no header); tenant B opts in via
// the test-only header. Small wrapper so every "as B" call reads clearly
// at the call site instead of a `.set(...)` tacked on everywhere.
const asB = {
  get: (url: string) => request(app).get(url).set("x-dev-account", "2"),
  post: (url: string) => request(app).post(url).set("x-dev-account", "2"),
  patch: (url: string) => request(app).patch(url).set("x-dev-account", "2"),
  delete: (url: string) => request(app).delete(url).set("x-dev-account", "2"),
};

beforeAll(async () => {
  await ensureDevAccount(DEV_ACCOUNT_AUTH_ID);
  await ensureDevAccount(DEV_ACCOUNT_AUTH_ID_2);
});

describe("cross-tenant isolation", () => {
  it("blocks reading another tenant's customer", async () => {
    const created = await request(app).post("/api/customers").send({ name: "Tenant A Customer" });
    const res = await asB.get(`/api/customers/${created.body.id}`);
    expect(res.status).toBe(404);
  });

  it("blocks creating a job against another tenant's customer", async () => {
    // This is the real bug this test suite exists to catch: without an
    // ownership check on customerId, tenant B could create a job under
    // their own account that points at tenant A's customer.
    const customerA = await request(app).post("/api/customers").send({ name: "A's customer (job test)" });
    const res = await asB.post("/api/jobs").send({ customerId: customerA.body.id, title: "Sneaky job" });
    expect(res.status).toBe(404);
  });

  it("blocks reading, updating, transitioning, and deleting another tenant's job", async () => {
    const customerA = await request(app).post("/api/customers").send({ name: "A's customer" });
    const jobA = await request(app).post("/api/jobs").send({ customerId: customerA.body.id, title: "A's job" });

    expect((await asB.get(`/api/jobs/${jobA.body.id}`)).status).toBe(404);
    expect((await asB.patch(`/api/jobs/${jobA.body.id}`).send({ title: "Hijacked" })).status).toBe(404);
    expect((await asB.patch(`/api/jobs/${jobA.body.id}/status`).send({ status: "CANCELLED" })).status).toBe(404);
    expect(
      (await asB.post(`/api/jobs/${jobA.body.id}/materials`).send({ description: "x", quantity: 1, unitCost: 1 })).status,
    ).toBe(404);
    expect((await asB.delete(`/api/jobs/${jobA.body.id}`)).status).toBe(404);
  });

  it("blocks reading, updating, sending, voiding, and downloading another tenant's invoice", async () => {
    const customerA = await request(app).post("/api/customers").send({ name: "A's customer 2" });
    const jobA = await request(app).post("/api/jobs").send({ customerId: customerA.body.id, title: "A's job 2" });
    const invoiceA = await request(app).post("/api/invoices").send({ jobId: jobA.body.id });

    expect((await asB.get(`/api/invoices/${invoiceA.body.id}`)).status).toBe(404);
    expect((await asB.patch(`/api/invoices/${invoiceA.body.id}`).send({ notesToCustomer: "Hijacked" })).status).toBe(404);
    expect((await asB.post(`/api/invoices/${invoiceA.body.id}/send`)).status).toBe(404);
    expect((await asB.post(`/api/invoices/${invoiceA.body.id}/void`)).status).toBe(404);
    expect((await asB.get(`/api/invoices/${invoiceA.body.id}/pdf`)).status).toBe(404);
  });

  it("also blocks creating an invoice against another tenant's job", async () => {
    const customerA = await request(app).post("/api/customers").send({ name: "A's customer 3" });
    const jobA = await request(app).post("/api/jobs").send({ customerId: customerA.body.id, title: "A's job 3" });
    const res = await asB.post("/api/invoices").send({ jobId: jobA.body.id });
    expect(res.status).toBe(404);
  });

  it("never includes another tenant's rows in list endpoints", async () => {
    const customerA = await request(app).post("/api/customers").send({ name: "List-check A customer" });
    const jobA = await request(app).post("/api/jobs").send({ customerId: customerA.body.id, title: "List-check A job" });
    const invoiceA = await request(app).post("/api/invoices").send({ jobId: jobA.body.id });

    const customersB: Array<{ id: string }> = (await asB.get("/api/customers")).body;
    const jobsB: Array<{ id: string }> = (await asB.get("/api/jobs")).body;
    const invoicesB: Array<{ id: string }> = (await asB.get("/api/invoices")).body;

    expect(customersB.some((c) => c.id === customerA.body.id)).toBe(false);
    expect(jobsB.some((j) => j.id === jobA.body.id)).toBe(false);
    expect(invoicesB.some((i) => i.id === invoiceA.body.id)).toBe(false);
  });
});
