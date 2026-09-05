import "../../env.js";
import "express-async-errors";
import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { jobsRouter } from "./router.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { prisma } from "../../lib/db.js";
import { ensureDevAccount } from "../../lib/devAuth.js";

// Real dev Postgres via the dev-auth bypass, same approach as
// ../account/router.test.ts.
const app = express();
app.use(express.json());
app.use("/api/jobs", jobsRouter);
app.use(errorHandler);

let customerId: string;

beforeAll(async () => {
  const account = await ensureDevAccount();
  const customer = await prisma.customer.create({
    data: { accountId: account.id, name: "Test Customer" },
  });
  customerId = customer.id;
});

describe("POST /api/jobs", () => {
  it("creates a job", async () => {
    const res = await request(app)
      .post("/api/jobs")
      .send({ customerId, title: "Rewire kitchen" });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Rewire kitchen");
    expect(res.body.status).toBe("QUOTED");
    expect(res.body.customer.name).toBe("Test Customer");
  });

  it("rejects a missing title", async () => {
    const res = await request(app).post("/api/jobs").send({ customerId });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/jobs/:id", () => {
  it("404s for a job that doesn't exist", async () => {
    const res = await request(app).get(`/api/jobs/${randomUUID()}`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/jobs/:id/status", () => {
  it("stamps completedAt when moved to COMPLETE, and clears it otherwise", async () => {
    const created = await request(app).post("/api/jobs").send({ customerId, title: "Boiler service" });
    const jobId = created.body.id;

    const completed = await request(app).patch(`/api/jobs/${jobId}/status`).send({ status: "COMPLETE" });
    expect(completed.status).toBe(204);
    const afterComplete = await request(app).get(`/api/jobs/${jobId}`);
    expect(afterComplete.body.completedAt).not.toBeNull();

    const reopened = await request(app).patch(`/api/jobs/${jobId}/status`).send({ status: "IN_PROGRESS" });
    expect(reopened.status).toBe(204);
    const afterReopen = await request(app).get(`/api/jobs/${jobId}`);
    expect(afterReopen.body.completedAt).toBeNull();
  });
});

describe("job materials", () => {
  it("adds and removes a material", async () => {
    const created = await request(app).post("/api/jobs").send({ customerId, title: "Fuse board" });
    const jobId = created.body.id;

    const added = await request(app)
      .post(`/api/jobs/${jobId}/materials`)
      .send({ description: "Consumer unit", quantity: 1, unitCost: 85 });
    expect(added.status).toBe(201);

    const removed = await request(app).delete(`/api/jobs/${jobId}/materials/${added.body.id}`);
    expect(removed.status).toBe(204);

    const removedAgain = await request(app).delete(`/api/jobs/${jobId}/materials/${added.body.id}`);
    expect(removedAgain.status).toBe(404);
  });
});
