// Resend inbound webhook handler — see brief §9. Drives the SENT ->
// VIEWED invoice transition and is the sole writer of EmailEvent rows for
// inbound provider events (outbound "sent" events are written by the
// jobs-runner send job itself, see ../../jobs-runner/index.ts).
//
// Originally built against Postmark; switched to Resend because Postmark's
// signup flow rejects public/free email domains, which blocked account
// creation entirely. The EmailEvent schema (providerMessageId,
// EmailEventType enum) was already provider-agnostic, so only this file,
// its route registration, and env var names needed to change.
//
// Mounted at POST /api/webhooks/resend, deliberately NOT behind
// resolveAccount — the caller is Resend, not a tenant session. Tenant
// scope is derived from the invoice the event correlates to via
// provider_message_id (Resend's `data.email_id`).
import type { Request, Response } from "express";
import { Webhook, WebhookVerificationError } from "svix";
import type { EmailEventType } from "@hephaste/shared-types";
import { assertValidTransition } from "@hephaste/invoice-engine";
import { prisma } from "../../lib/db.js";

declare global {
  namespace Express {
    interface Request {
      // Populated by server.ts's express.json({ verify }) for every
      // request — Svix signature verification needs the exact raw bytes
      // that were signed, which the already-parsed req.body can't
      // guarantee (key order/whitespace can differ after a
      // parse-then-restringify round trip).
      rawBody?: Buffer;
    }
  }
}

// Resend's webhook event shape (subset of fields used here). Delivered via
// Svix — see https://resend.com/docs/dashboard/webhooks/event-types.
interface ResendWebhookPayload {
  type:
    | "email.sent"
    | "email.delivered"
    | "email.delivery_delayed"
    | "email.complained"
    | "email.bounced"
    | "email.opened"
    | "email.clicked"
    | "email.failed";
  created_at: string;
  data: {
    email_id: string;
    to?: string[];
  };
}

const EVENT_TYPE_MAP: Partial<Record<ResendWebhookPayload["type"], EmailEventType>> = {
  "email.sent": "SENT",
  "email.delivered": "DELIVERED",
  "email.opened": "OPENED",
  "email.bounced": "BOUNCED",
  "email.complained": "SPAM_COMPLAINT",
};

function verifySignature(req: Request): unknown | null {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret || !req.rawBody) return null;
  try {
    return new Webhook(secret).verify(req.rawBody, {
      "svix-id": req.header("svix-id") ?? "",
      "svix-timestamp": req.header("svix-timestamp") ?? "",
      "svix-signature": req.header("svix-signature") ?? "",
    });
  } catch (err) {
    if (err instanceof WebhookVerificationError) return null;
    throw err;
  }
}

export async function handleResendWebhook(req: Request, res: Response) {
  const verified = verifySignature(req);
  if (!verified) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = req.body as ResendWebhookPayload;
  const eventType = EVENT_TYPE_MAP[payload.type];
  if (!eventType) {
    // Unrecognized/unhandled event type (delivery_delayed, clicked,
    // failed) — ack anyway so Resend doesn't retry indefinitely for
    // something we deliberately don't handle.
    res.status(200).json({ ignored: true });
    return;
  }

  const occurredAt = new Date(payload.created_at);
  const recipientEmail = payload.data.to?.[0] ?? "unknown";
  const providerMessageId = payload.data.email_id;

  // Idempotency: Resend/Svix can redeliver the same webhook. Dedupe on the
  // natural key before doing anything else.
  const existing = await prisma.emailEvent.findFirst({
    where: { providerMessageId, eventType, occurredAt },
  });
  if (existing) {
    res.status(200).json({ deduped: true });
    return;
  }

  // Correlate back to the invoice this message was sent for. The send job
  // (jobs-runner) must have already written an EmailEvent with
  // eventType SENT carrying this email_id for this lookup to succeed.
  const sentEvent = await prisma.emailEvent.findFirst({
    where: { providerMessageId, eventType: "SENT" },
    select: { accountId: true, invoiceId: true },
  });

  if (!sentEvent) {
    // We have no record of sending this message — log for investigation
    // but still 200 so Resend doesn't retry forever.
    console.error(`Resend webhook for unknown email_id: ${providerMessageId}`);
    res.status(200).json({ warning: "unknown message id" });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.emailEvent.create({
      data: {
        accountId: sentEvent.accountId,
        invoiceId: sentEvent.invoiceId,
        providerMessageId,
        eventType,
        recipientEmail,
        occurredAt,
        rawPayload: payload as unknown as object,
      },
    });

    if (eventType === "OPENED") {
      const invoice = await tx.invoice.findUnique({
        where: { id: sentEvent.invoiceId },
        select: { status: true, firstViewedAt: true },
      });

      // Only the *first* open transitions status; subsequent opens still
      // get an EmailEvent row (written above) but don't re-fire the
      // transition — see brief §4, sent -> viewed is a one-way edge.
      if (invoice && invoice.status === "SENT" && !invoice.firstViewedAt) {
        assertValidTransition("SENT", "VIEWED", "EMAIL_WEBHOOK");

        await tx.invoice.update({
          where: { id: sentEvent.invoiceId },
          data: { status: "VIEWED", firstViewedAt: occurredAt },
        });

        await tx.invoiceStatusEvent.create({
          data: {
            invoiceId: sentEvent.invoiceId,
            accountId: sentEvent.accountId,
            fromStatus: "SENT",
            toStatus: "VIEWED",
            triggeredBy: "EMAIL_WEBHOOK",
            metadata: { resendEmailId: providerMessageId },
          },
        });
      }
    }

    // BOUNCED intentionally does NOT change invoice status (a bounce
    // doesn't mean unpaid vs paid) — see brief §9.3. The UI surfaces a
    // warning banner by querying EmailEvent directly (Phase 1).
  });

  res.status(200).json({ ok: true });
}
