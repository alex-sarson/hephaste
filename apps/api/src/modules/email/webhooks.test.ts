// This handler was previously untested (Postmark-shaped, never exercised
// even manually — no POSTMARK_SERVER_TOKEN was ever configured). Rewriting
// it for Resend/Svix is a good moment to actually cover it, especially
// since it's the one route in the app that changes Invoice.status from
// something other than a direct user action.
import "../../env.js";
import "express-async-errors";
import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { Webhook } from "svix";
import { beforeAll, describe, expect, it } from "vitest";
import { handleResendWebhook } from "./webhooks.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { prisma } from "../../lib/db.js";
import { ensureDevAccount } from "../../lib/devAuth.js";
import * as invoicesRepo from "../invoices/repository.js";

// A syntactically valid (arbitrary) Svix webhook secret — doesn't need to
// be a real Resend-issued one, just base64 after the "whsec_" prefix.
const WEBHOOK_SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;

const app = express();
// Mirrors server.ts's real setup: verify() needs raw bytes, not a
// reparsed req.body.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request).rawBody = buf;
    },
  }),
);
app.post("/api/webhooks/resend", handleResendWebhook);
app.use(errorHandler);

function signedRequest(body: unknown) {
  const payload = JSON.stringify(body);
  const msgId = `msg_${randomUUID()}`;
  const timestamp = new Date();
  const signature = new Webhook(WEBHOOK_SECRET).sign(msgId, timestamp, payload);
  return request(app)
    .post("/api/webhooks/resend")
    .set("svix-id", msgId)
    .set("svix-timestamp", String(Math.floor(timestamp.getTime() / 1000)))
    .set("svix-signature", signature)
    .set("Content-Type", "application/json")
    .send(payload);
}

let accountId: string;
let customerId: string;

beforeAll(async () => {
  const account = await ensureDevAccount();
  accountId = account.id;
  const customer = await prisma.customer.create({
    data: { accountId, name: "Webhook Test Customer", email: "webhook-test@example.test" },
  });
  customerId = customer.id;
});

async function createSentInvoice() {
  const job = await prisma.job.create({ data: { accountId, customerId, title: "Job for webhook test" } });
  const invoice = await invoicesRepo.create(accountId, job.id);
  if (!invoice) throw new Error("setup failed");
  await invoicesRepo.update(accountId, invoice.id, {
    lineItems: [{ description: "Labour", type: "LABOUR", quantity: 1, unitPrice: 50, sortOrder: 0 }],
  });
  await invoicesRepo.transition(accountId, invoice.id, "SENT", "MANUAL_USER");
  return invoice.id;
}

async function recordSentEvent(invoiceId: string, emailId: string) {
  await prisma.emailEvent.create({
    data: {
      accountId,
      invoiceId,
      providerMessageId: emailId,
      eventType: "SENT",
      recipientEmail: "webhook-test@example.test",
      occurredAt: new Date(),
    },
  });
}

describe("POST /api/webhooks/resend", () => {
  it("rejects a request with no signature", async () => {
    const res = await request(app).post("/api/webhooks/resend").send({ type: "email.opened", data: {} });
    expect(res.status).toBe(401);
  });

  it("rejects a request with an invalid signature", async () => {
    const res = await request(app)
      .post("/api/webhooks/resend")
      .set("svix-id", "msg_fake")
      .set("svix-timestamp", String(Math.floor(Date.now() / 1000)))
      .set("svix-signature", "v1,not-a-real-signature")
      .send({ type: "email.opened", data: { email_id: "whatever" } });
    expect(res.status).toBe(401);
  });

  it("acks an unrecognized event type without touching anything", async () => {
    const res = await signedRequest({
      type: "email.clicked",
      created_at: new Date().toISOString(),
      data: { email_id: `unknown-${randomUUID()}` },
    });
    expect(res.status).toBe(200);
    expect(res.body.ignored).toBe(true);
  });

  it("acks (200) but warns for an email_id with no prior SENT event", async () => {
    const res = await signedRequest({
      type: "email.opened",
      created_at: new Date().toISOString(),
      data: { email_id: `orphan-${randomUUID()}` },
    });
    expect(res.status).toBe(200);
    expect(res.body.warning).toBeDefined();
  });

  it("transitions SENT -> VIEWED on first open, and only on the first open", async () => {
    const invoiceId = await createSentInvoice();
    const emailId = `email_${randomUUID()}`;
    await recordSentEvent(invoiceId, emailId);

    const opened = await signedRequest({
      type: "email.opened",
      created_at: new Date().toISOString(),
      data: { email_id: emailId, to: ["webhook-test@example.test"] },
    });
    expect(opened.status).toBe(200);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.status).toBe("VIEWED");
    expect(invoice.firstViewedAt).not.toBeNull();

    // A second open (a fresh event — different occurredAt — so it isn't
    // just deduped) must not re-fire the transition or blow up.
    const openedAgain = await signedRequest({
      type: "email.opened",
      created_at: new Date(Date.now() + 1000).toISOString(),
      data: { email_id: emailId, to: ["webhook-test@example.test"] },
    });
    expect(openedAgain.status).toBe(200);

    const events = await prisma.emailEvent.findMany({ where: { invoiceId, eventType: "OPENED" } });
    expect(events).toHaveLength(2);
  });

  it("dedupes an exact redelivery of the same event", async () => {
    const invoiceId = await createSentInvoice();
    const emailId = `email_${randomUUID()}`;
    await recordSentEvent(invoiceId, emailId);

    const body = {
      type: "email.bounced" as const,
      created_at: new Date().toISOString(),
      data: { email_id: emailId, to: ["webhook-test@example.test"] },
    };

    const first = await signedRequest(body);
    expect(first.status).toBe(200);
    const redelivered = await signedRequest(body);
    expect(redelivered.status).toBe(200);
    expect(redelivered.body.deduped).toBe(true);

    const events = await prisma.emailEvent.findMany({ where: { invoiceId, eventType: "BOUNCED" } });
    expect(events).toHaveLength(1);
  });
});
