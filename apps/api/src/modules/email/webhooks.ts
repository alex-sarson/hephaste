// Postmark inbound webhook handler — see brief §9.3. Drives the
// SENT -> VIEWED invoice transition and is the sole writer of EmailEvent
// rows for inbound provider events (outbound "sent" events are written by
// the jobs-runner send job itself, see ../../jobs-runner/index.ts).
//
// Mounted at POST /api/webhooks/postmark, deliberately NOT behind
// resolveAccount — the caller is Postmark, not a tenant session. Tenant
// scope is derived from the invoice the event correlates to via
// provider_message_id.
import type { Request, Response } from "express";
import type { EmailEventType } from "@trade-platform/shared-types";
import { assertValidTransition } from "@trade-platform/invoice-engine";
import { prisma } from "../../lib/db.js";

// Postmark's outbound-message webhook payload shape (subset of fields used
// here). See https://postmarkapp.com/developer/webhooks/webhooks-overview.
interface PostmarkWebhookPayload {
  RecordType: "Delivery" | "Open" | "Bounce" | "SpamComplaint";
  MessageID: string;
  Recipient?: string;
  Email?: string;
  ReceivedAt?: string;
  DeliveredAt?: string;
  BouncedAt?: string;
}

const RECORD_TYPE_TO_EVENT_TYPE: Record<PostmarkWebhookPayload["RecordType"], EmailEventType> = {
  Delivery: "DELIVERED",
  Open: "OPENED",
  Bounce: "BOUNCED",
  SpamComplaint: "SPAM_COMPLAINT",
};

function verifyPostmarkAuth(req: Request): boolean {
  // Postmark webhooks are verified via HTTP Basic Auth configured on the
  // webhook URL itself (recommended in their docs) rather than a signature
  // header. Compare against a secret pair set via env vars.
  const auth = req.headers.authorization;
  const expected = process.env.POSTMARK_WEBHOOK_BASIC_AUTH; // "user:pass", base64-free
  if (!expected || !auth?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(auth.slice("Basic ".length), "base64").toString("utf8");
  return decoded === expected;
}

export async function handlePostmarkWebhook(req: Request, res: Response) {
  if (!verifyPostmarkAuth(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = req.body as PostmarkWebhookPayload;
  const eventType = RECORD_TYPE_TO_EVENT_TYPE[payload.RecordType];
  if (!eventType) {
    // Unrecognized record type — ack anyway so Postmark doesn't retry
    // indefinitely for an event type we deliberately don't handle.
    res.status(200).json({ ignored: true });
    return;
  }

  const occurredAt = new Date(
    payload.DeliveredAt ?? payload.ReceivedAt ?? payload.BouncedAt ?? Date.now(),
  );
  const recipientEmail = payload.Recipient ?? payload.Email ?? "unknown";

  // Idempotency: Postmark can redeliver the same webhook. Dedupe on the
  // natural key before doing anything else.
  const existing = await prisma.emailEvent.findFirst({
    where: {
      providerMessageId: payload.MessageID,
      eventType,
      occurredAt,
    },
  });
  if (existing) {
    res.status(200).json({ deduped: true });
    return;
  }

  // Correlate back to the invoice this message was sent for. The send job
  // (jobs-runner) must have already written an EmailEvent with
  // eventType SENT carrying this MessageID for this lookup to succeed.
  const sentEvent = await prisma.emailEvent.findFirst({
    where: { providerMessageId: payload.MessageID, eventType: "SENT" },
    select: { accountId: true, invoiceId: true },
  });

  if (!sentEvent) {
    // We have no record of sending this message — log for investigation
    // but still 200 so Postmark doesn't retry forever.
    console.error(`Postmark webhook for unknown MessageID: ${payload.MessageID}`);
    res.status(200).json({ warning: "unknown message id" });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.emailEvent.create({
      data: {
        accountId: sentEvent.accountId,
        invoiceId: sentEvent.invoiceId,
        providerMessageId: payload.MessageID,
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
            metadata: { postmarkMessageId: payload.MessageID },
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
