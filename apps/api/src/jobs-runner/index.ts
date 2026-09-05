// Background worker process — see brief §10. Deployed as a second small
// process/service (`pnpm --filter @trade-platform/api jobs-runner`, or via
// `pnpm dev` at the repo root — see turbo.json's `jobs-runner` task),
// separate from the HTTP server, polling the BackgroundJob table.
import "../env.js";
import { fileURLToPath } from "node:url";
import { renderInvoicePdf } from "@trade-platform/pdf";
import { prisma } from "../lib/db.js";
import { buildInvoicePdfData } from "../modules/invoices/pdfData.js";

const POLL_INTERVAL_MS = 5000;

export async function detectOverdue() {
  const result = await prisma.invoice.updateMany({
    where: {
      status: { in: ["SENT", "VIEWED"] },
      overdue: false,
      dueDate: { lt: new Date() },
    },
    data: { overdue: true },
  });
  if (result.count > 0) {
    console.log(`Marked ${result.count} invoice(s) overdue`);
  }
}

/**
 * The slow/failure-prone half of "sending" an invoice (brief §9): render
 * the PDF and hand it to an email provider. The DRAFT -> SENT transition
 * itself already happened synchronously in the request (see
 * modules/invoices/router.ts's POST /:id/send) — this only needs to
 * record that the email side actually went out.
 *
 * No RESEND_API_KEY is configured (stubbed on purpose, matching the
 * dev-auth bypass's philosophy — swap in a real Resend call once a key
 * exists), so this logs what *would* have been sent instead of actually
 * calling Resend, but still renders a real PDF and writes a real
 * EmailEvent(SENT) row with a providerMessageId — the row the Resend
 * webhook handler (modules/email/webhooks.ts) needs to later correlate
 * an Open event against and drive SENT -> VIEWED.
 */
export async function sendInvoiceEmail(payload: { invoiceId: string }) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: payload.invoiceId },
    include: {
      customer: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      account: true,
    },
  });
  if (!invoice) {
    console.error(`SEND_INVOICE_EMAIL: invoice ${payload.invoiceId} not found`);
    return;
  }

  // Idempotent against a rerun of the same job (there's no retry loop
  // today — see the FAILED-never-retried note below — but this keeps the
  // handler correct if one gets added, or if it's ever invoked twice by
  // mistake): the SENT event for a given invoice is only ever written once.
  const alreadySent = await prisma.emailEvent.findFirst({
    where: { invoiceId: invoice.id, eventType: "SENT" },
  });
  if (alreadySent) {
    console.log(`SEND_INVOICE_EMAIL: ${invoice.invoiceNumber} already has a SENT EmailEvent, skipping`);
    return;
  }

  const pdfBuffer = await renderInvoicePdf(buildInvoicePdfData(invoice, invoice.account));
  const providerMessageId = `dev-stub-${invoice.id}`;

  console.log(
    `[dev email stub] Would send ${invoice.invoiceNumber} to ${invoice.customer.email ?? "(no email on file)"}` +
      ` — ${pdfBuffer.length}-byte PDF attached. No RESEND_API_KEY configured, so nothing was actually delivered.`,
  );

  await prisma.emailEvent.create({
    data: {
      accountId: invoice.accountId,
      invoiceId: invoice.id,
      providerMessageId,
      eventType: "SENT",
      recipientEmail: invoice.customer.email ?? "unknown",
      occurredAt: new Date(),
    },
  });
}

async function claimNextJob() {
  // SELECT ... FOR UPDATE SKIP LOCKED pattern — see brief §10.2. Prisma
  // doesn't expose row locking directly, so this uses a raw query for the
  // claim and the ORM for everything else.
  const [job] = await prisma.$queryRaw<Array<{ id: string; type: string; payload: unknown }>>`
    UPDATE background_jobs
    SET status = 'RUNNING', attempts = attempts + 1, updated_at = now()
    WHERE id = (
      SELECT id FROM background_jobs
      WHERE status = 'PENDING' AND run_after <= now()
      ORDER BY run_after
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, type, payload
  `;
  return job ?? null;
}

async function runJob(job: { id: string; type: string; payload: unknown }) {
  try {
    switch (job.type) {
      case "DETECT_OVERDUE":
        await detectOverdue();
        break;
      case "SEND_INVOICE_EMAIL":
        await sendInvoiceEmail(job.payload as { invoiceId: string });
        break;
      case "SEND_REMINDER":
        throw new Error(`Job type ${job.type} not implemented until Phase 2`);
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: { status: "SUCCEEDED" },
    });
  } catch (err) {
    // NOTE: a FAILED job is never retried today — attempts/maxAttempts
    // exist on the schema but nothing resets status back to PENDING.
    // Fine for a stubbed send (nothing external can actually fail yet);
    // worth revisiting once this calls a real Resend API that can.
    console.error(`Job ${job.id} (${job.type}) failed:`, err);
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        lastError: (err as Error).message,
      },
    });
  }
}

async function pollLoop() {
  const job = await claimNextJob();
  if (job) {
    await runJob(job);
  }
  setTimeout(pollLoop, POLL_INTERVAL_MS);
}

// The daily overdue sweep is enqueued via the hosting platform's native
// cron (brief §10.2) hitting a small trigger endpoint or invoked directly
// on a schedule — not wired here yet.

// Only start polling when this file is run as the actual entrypoint, not
// when its exported functions are imported directly (e.g. by
// sendInvoiceEmail.test.ts) — otherwise importing this module for testing
// would kick off an infinite background loop against the test database.
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  console.log("jobs-runner started, polling every", POLL_INTERVAL_MS, "ms");
  pollLoop();
}
