import "../../env.js";
import "express-async-errors";
import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { invoicesRouter } from "./router.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { prisma } from "../../lib/db.js";
import { ensureDevAccount } from "../../lib/devAuth.js";

// Real dev Postgres via the dev-auth bypass, same approach as the other
// modules' router.test.ts files.
const app = express();
app.use(express.json());
app.use("/api/invoices", invoicesRouter);
app.use(errorHandler);

let customerId: string;

async function createJob(withMaterial: boolean) {
  const job = await prisma.job.create({ data: { accountId, customerId, title: "Test job" } });
  if (withMaterial) {
    await prisma.jobMaterial.create({
      data: { jobId: job.id, accountId, description: "Consumer unit", quantity: 2, unitCost: 50 },
    });
  }
  return job.id;
}

let accountId: string;

beforeAll(async () => {
  const account = await ensureDevAccount();
  accountId = account.id;
  const customer = await prisma.customer.create({ data: { accountId, name: "Test Customer" } });
  customerId = customer.id;
});

describe("POST /api/invoices", () => {
  it("404s for a job that doesn't exist", async () => {
    const res = await request(app).post("/api/invoices").send({ jobId: randomUUID() });
    expect(res.status).toBe(404);
  });

  it("creates a draft invoice pre-filled from the job's materials", async () => {
    const jobId = await createJob(true);
    const res = await request(app).post("/api/invoices").send({ jobId });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.lineItems).toHaveLength(1);
    expect(res.body.subtotal).toBe("100");
    expect(res.body.taxAmount).toBe("20");
    expect(res.body.total).toBe("120");
  });
});

describe("PATCH /api/invoices/:id", () => {
  it("replaces line items and recomputes totals while DRAFT", async () => {
    const jobId = await createJob(false);
    const created = await request(app).post("/api/invoices").send({ jobId });
    const id = created.body.id;

    const res = await request(app)
      .patch(`/api/invoices/${id}`)
      .send({
        lineItems: [
          { description: "Labour", type: "LABOUR", quantity: 3, unitPrice: 40, sortOrder: 0 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.subtotal).toBe("120");
    expect(res.body.total).toBe("144");
  });

  it("409s once the invoice is no longer a draft", async () => {
    const jobId = await createJob(true);
    const created = await request(app).post("/api/invoices").send({ jobId });
    const id = created.body.id;
    await request(app).post(`/api/invoices/${id}/send`);

    const res = await request(app).patch(`/api/invoices/${id}`).send({ notesToCustomer: "hi" });
    expect(res.status).toBe(409);
  });
});

describe("invoice lifecycle", () => {
  it("won't send an invoice with no line items", async () => {
    const jobId = await createJob(false);
    const created = await request(app).post("/api/invoices").send({ jobId });
    const res = await request(app).post(`/api/invoices/${created.body.id}/send`);
    expect(res.status).toBe(409);
  });

  it("send -> mark-paid happy path, and rejects illegal transitions", async () => {
    const jobId = await createJob(true);
    const created = await request(app).post("/api/invoices").send({ jobId });
    const id = created.body.id;

    const sent = await request(app).post(`/api/invoices/${id}/send`);
    expect(sent.status).toBe(200);
    expect(sent.body.status).toBe("SENT");

    // The status flips synchronously, but the actual PDF-render/email
    // work is deferred to the jobs-runner (brief §9) — verify /send
    // enqueues that, not that it happened (see
    // jobs-runner/sendInvoiceEmail.test.ts for the handler itself).
    const enqueued = await prisma.backgroundJob.findFirst({
      where: { type: "SEND_INVOICE_EMAIL", payload: { equals: { invoiceId: id } } },
    });
    expect(enqueued).not.toBeNull();

    const sentAgain = await request(app).post(`/api/invoices/${id}/send`);
    expect(sentAgain.status).toBe(409);

    const paid = await request(app)
      .post(`/api/invoices/${id}/mark-paid`)
      .send({ amountPaid: 120, paidMethod: "bank transfer" });
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe("PAID");

    const voided = await request(app).post(`/api/invoices/${id}/void`);
    expect(voided.status).toBe(409);
  });

  it("void is reachable from draft", async () => {
    const jobId = await createJob(false);
    const created = await request(app).post("/api/invoices").send({ jobId });
    const voided = await request(app).post(`/api/invoices/${created.body.id}/void`);
    expect(voided.status).toBe(200);
    expect(voided.body.status).toBe("VOID");
  });
});

describe("email send status + retry", () => {
  it("GET /:id reports emailSend: null before any send is attempted", async () => {
    const jobId = await createJob(false);
    const created = await request(app).post("/api/invoices").send({ jobId });

    const res = await request(app).get(`/api/invoices/${created.body.id}`);
    expect(res.body.emailSend).toBeNull();
  });

  it("reports SENDING right after /send, while the background job is still pending", async () => {
    const jobId = await createJob(true);
    const created = await request(app).post("/api/invoices").send({ jobId });
    await request(app).post(`/api/invoices/${created.body.id}/send`);

    const res = await request(app).get(`/api/invoices/${created.body.id}`);
    expect(res.body.emailSend).toMatchObject({ status: "SENDING", lastError: null });
  });

  it("resend-email 409s while a send is already in progress, and before anything's been sent", async () => {
    const jobId = await createJob(true);
    const created = await request(app).post("/api/invoices").send({ jobId });
    const id = created.body.id;

    const beforeSend = await request(app).post(`/api/invoices/${id}/resend-email`);
    expect(beforeSend.status).toBe(409);

    await request(app).post(`/api/invoices/${id}/send`);
    const whileSending = await request(app).post(`/api/invoices/${id}/resend-email`);
    expect(whileSending.status).toBe(409);
  });

  it("resend-email enqueues a fresh job once the last attempt FAILED, and 409s again once it SUCCEEDED", async () => {
    const jobId = await createJob(true);
    const created = await request(app).post("/api/invoices").send({ jobId });
    const id = created.body.id;
    await request(app).post(`/api/invoices/${id}/send`);

    // Simulate the jobs-runner having already picked up and failed the
    // job — these tests don't run the real jobs-runner process, so its
    // outcome is faked directly rather than waiting on a poll loop that
    // isn't running.
    await prisma.backgroundJob.updateMany({
      where: { type: "SEND_INVOICE_EMAIL", payload: { equals: { invoiceId: id } } },
      data: { status: "FAILED", lastError: "Resend rejected: the domain is invalid" },
    });

    const retried = await request(app).post(`/api/invoices/${id}/resend-email`);
    expect(retried.status).toBe(202);

    const afterRetry = await request(app).get(`/api/invoices/${id}`);
    expect(afterRetry.body.emailSend).toMatchObject({ status: "SENDING" });

    // Now simulate that retry succeeding — the FAILED job stays FAILED,
    // but it's no longer the *latest* one, so the derived status should
    // read from the newer SUCCEEDED job instead.
    await prisma.backgroundJob.updateMany({
      where: { type: "SEND_INVOICE_EMAIL", payload: { equals: { invoiceId: id } }, status: "PENDING" },
      data: { status: "SUCCEEDED" },
    });

    const afterSuccess = await request(app).get(`/api/invoices/${id}`);
    expect(afterSuccess.body.emailSend).toMatchObject({ status: "SENT", lastError: null });

    const retryAfterSuccess = await request(app).post(`/api/invoices/${id}/resend-email`);
    expect(retryAfterSuccess.status).toBe(409);
  });
});

describe("GET /api/invoices/:id/pdf", () => {
  it("returns a PDF for an existing invoice", async () => {
    const jobId = await createJob(true);
    const created = await request(app).post("/api/invoices").send({ jobId });

    // supertest/superagent has no built-in parser for application/pdf, so
    // rather than fight its body/text parsing for a binary response, just
    // confirm real PDF bytes actually came back — the pdf package's own
    // tests already cover the document content itself.
    const res = await request(app).get(`/api/invoices/${created.body.id}/pdf`).buffer(true).parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => callback(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect((res.body as Buffer).subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("404s for an invoice that doesn't exist", async () => {
    const res = await request(app).get(`/api/invoices/${randomUUID()}/pdf`);
    expect(res.status).toBe(404);
  });
});
