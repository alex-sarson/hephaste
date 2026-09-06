import "../../env.js";
import "express-async-errors";
import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../middleware/errorHandler.js";
import { prisma } from "../../lib/db.js";
import { ensureDevAccount } from "../../lib/devAuth.js";

// The attachments routes call out to S3 (lib/storage.ts) — mocked here so
// this suite never makes a real network call, same isolation principle as
// the jobs-runner boundary around Resend. uploadedKeys/deletedKeys let
// individual tests assert on what would have been sent to the bucket.
// vi.mock is hoisted above the imports below by vitest's transform, so this
// takes effect before router.js (and its import of lib/storage.js) loads.
const uploadedKeys: string[] = [];
const deletedKeys: string[] = [];
vi.mock("../../lib/storage.js", () => ({
  buildAttachmentKey: (accountId: string, jobId: string, originalFilename: string) =>
    `attachments/${accountId}/${jobId}/mock-${originalFilename}`,
  uploadObject: vi.fn(async (key: string) => {
    uploadedKeys.push(key);
  }),
  deleteObject: vi.fn(async (key: string) => {
    deletedKeys.push(key);
  }),
  getDownloadUrl: vi.fn(async (key: string) => `https://mock-bucket.example/${key}?signed=1`),
}));

import { jobsRouter } from "./router.js";

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

describe("job attachments", () => {
  it("uploads, lists (via job detail), gets a download url, and deletes an attachment", async () => {
    const created = await request(app).post("/api/jobs").send({ customerId, title: "Roof inspection" });
    const jobId = created.body.id;

    const uploaded = await request(app)
      .post(`/api/jobs/${jobId}/attachments`)
      .attach("file", Buffer.from("fake-image-bytes"), { filename: "roof.jpg", contentType: "image/jpeg" });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.fileType).toBe("image/jpeg");
    expect(uploaded.body.originalFilename).toBe("roof.jpg");
    expect(uploaded.body.fileSizeBytes).toBe(Buffer.from("fake-image-bytes").length);
    expect(uploadedKeys).toContain(uploaded.body.fileUrl);

    const job = await request(app).get(`/api/jobs/${jobId}`);
    expect(job.body.attachments).toHaveLength(1);
    expect(job.body.attachments[0].id).toBe(uploaded.body.id);

    const url = await request(app).get(`/api/jobs/${jobId}/attachments/${uploaded.body.id}/url`);
    expect(url.status).toBe(200);
    expect(url.body.url).toContain(uploaded.body.fileUrl);

    const removed = await request(app).delete(`/api/jobs/${jobId}/attachments/${uploaded.body.id}`);
    expect(removed.status).toBe(204);
    expect(deletedKeys).toContain(uploaded.body.fileUrl);

    const removedAgain = await request(app).delete(`/api/jobs/${jobId}/attachments/${uploaded.body.id}`);
    expect(removedAgain.status).toBe(404);
  });

  it("rejects a disallowed file type", async () => {
    const created = await request(app).post("/api/jobs").send({ customerId, title: "Fence repair" });
    const jobId = created.body.id;

    const res = await request(app)
      .post(`/api/jobs/${jobId}/attachments`)
      .attach("file", Buffer.from("#!/bin/sh\necho hi"), { filename: "script.sh", contentType: "application/x-sh" });
    expect(res.status).toBe(400);
  });

  it("rejects a file over the size limit", async () => {
    const created = await request(app).post("/api/jobs").send({ customerId, title: "Loft conversion" });
    const jobId = created.body.id;

    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1);
    const res = await request(app)
      .post(`/api/jobs/${jobId}/attachments`)
      .attach("file", oversized, { filename: "huge.png", contentType: "image/png" });
    expect(res.status).toBe(413);
  });

  it("404s uploading to a job that doesn't exist", async () => {
    const res = await request(app)
      .post(`/api/jobs/${randomUUID()}/attachments`)
      .attach("file", Buffer.from("x"), { filename: "a.png", contentType: "image/png" });
    expect(res.status).toBe(404);
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
