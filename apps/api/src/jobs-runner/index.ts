// Background worker process — see brief §10. Deployed as a second small
// process/service (`pnpm --filter @trade-platform/api jobs-runner`, or via
// `pnpm dev` at the repo root — see turbo.json's `jobs-runner` task),
// separate from the HTTP server, polling the BackgroundJob table.
import "../env.js";
import { fileURLToPath } from "node:url";
import { Resend } from "resend";
import { renderInvoicePdf } from "@trade-platform/pdf";
import { renderInvoiceSentEmail } from "@trade-platform/email-templates";
import { prisma } from "../lib/db.js";
import { buildInvoicePdfData } from "../modules/invoices/pdfData.js";

const POLL_INTERVAL_MS = 5000;

// NODE_ENV !== "test" mirrors the backstop in lib/devAuth.ts's
// isDevAuthEnabled(): Vitest sets NODE_ENV=test on its own, and a real
// .env in a dev checkout can (and now does) hold a live RESEND_API_KEY.
// Without this, `vitest run` would fire real emails through Resend.
const resend =
  process.env.RESEND_API_KEY && process.env.NODE_ENV !== "test"
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

// Resend's own sandbox sender — deliverable without a verified domain, see
// brief §9. Set RESEND_FROM_EMAIL once a real domain is verified.
//
// `||`, not `??`: .env.example documents an unset RESEND_FROM_EMAIL as "use
// the sandbox sender", and `KEY=` in a .env file parses to "" (present,
// not absent) — `??` only falls back on null/undefined, so it left
// FROM_EMAIL as an empty string and Resend rejected every send with "the
// domain is invalid" until this was caught. `||` treats "" as absent too,
// which is what's actually wanted for an email address.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

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

const OVERDUE_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Keeps a daily DETECT_OVERDUE job flowing through the same BackgroundJob
 * queue detectOverdue()'s caller (runJob) already knows how to run — see
 * brief §10.2, previously "not wired here yet" (no hosting platform is
 * chosen — docs/PROJECT_PLAN.md §12 — so there's no native cron to hit yet
 * either).
 *
 * Deliberately DB-state-driven (checks the last DETECT_OVERDUE row's
 * createdAt/status) rather than an in-memory timer, so this stays correct
 * across a process restart (tsx watch, a redeploy) or multiple runner
 * instances without double-enqueuing — nothing here needs to change on the
 * day a real platform cron replaces this loop with a trigger endpoint call
 * instead. Not account-scoped (BackgroundJob.accountId is nullable exactly
 * for this — see schema.prisma), since detectOverdue() itself sweeps every
 * account in one query.
 */
export async function maybeScheduleOverdueSweep() {
  const last = await prisma.backgroundJob.findFirst({
    where: { type: "DETECT_OVERDUE" },
    orderBy: { createdAt: "desc" },
  });
  if (last && (last.status === "PENDING" || last.status === "RUNNING")) return;
  if (last && Date.now() - last.createdAt.getTime() < OVERDUE_SWEEP_INTERVAL_MS) return;
  await prisma.backgroundJob.create({ data: { type: "DETECT_OVERDUE", payload: {} } });
}

/**
 * The slow/failure-prone half of "sending" an invoice (brief §9): render
 * the PDF and hand it to an email provider. The DRAFT -> SENT transition
 * itself already happened synchronously in the request (see
 * modules/invoices/router.ts's POST /:id/send) — this only needs to
 * record that the email side actually went out.
 *
 * Falls back to a dev-stub log (no real send) when either RESEND_API_KEY
 * isn't configured or the customer has no email on file — but still
 * renders a real PDF and writes a real EmailEvent(SENT) row with a
 * providerMessageId either way, since that's the row the Resend webhook
 * handler (modules/email/webhooks.ts) needs to later correlate an Open
 * event against and drive SENT -> VIEWED.
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
  const recipientEmail = invoice.customer.email;
  let providerMessageId: string;

  if (resend && recipientEmail) {
    const { subject, html } = renderInvoiceSentEmail({
      businessName: invoice.account.businessName,
      customerName: invoice.customer.name,
      invoiceNumber: invoice.invoiceNumber,
      total: Number(invoice.total),
      currency: invoice.account.currency,
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : null,
    });
    const sendArgs = {
      from: FROM_EMAIL,
      to: recipientEmail,
      subject,
      html,
      attachments: [{ filename: `${invoice.invoiceNumber}.pdf`, content: pdfBuffer }],
    };
    // The sending business gets a copy of every invoice email it triggers,
    // so they have their own confirmation it actually went out rather than
    // having to trust the app's UI — but Resend validates every recipient
    // field (to/cc/bcc) in one atomic request, so a single bad bcc address
    // (a placeholder/typo'd contactEmail in Settings — this actually
    // happened) would otherwise fail the *entire* send, blocking delivery
    // to the customer for a reason that has nothing to do with them.
    // Retrying once without bcc keeps the confirmation-copy feature from
    // being able to sink the one thing that actually matters.
    let { data, error } = await resend.emails.send({ ...sendArgs, bcc: invoice.account.contactEmail });
    let bccIncluded = true;
    if (error) {
      console.warn(
        `SEND_INVOICE_EMAIL: Resend rejected ${invoice.invoiceNumber} with bcc ${invoice.account.contactEmail} (${error.message}); retrying without bcc`,
      );
      bccIncluded = false;
      ({ data, error } = await resend.emails.send(sendArgs));
    }
    // Thrown, not swallowed — caught by runJob's try/catch, which marks
    // the BackgroundJob FAILED with the error message. Unlike the stub
    // path, a real Resend call can genuinely fail (bad address, quota,
    // provider outage), so this must not record a false SENT event.
    if (error) throw new Error(`Resend rejected ${invoice.invoiceNumber}: ${error.message}`);
    providerMessageId = data!.id;
    console.log(
      `SEND_INVOICE_EMAIL: sent ${invoice.invoiceNumber} to ${recipientEmail}` +
        (bccIncluded ? ` (bcc ${invoice.account.contactEmail})` : " (bcc dropped — see warning above)") +
        ` via Resend (id=${providerMessageId})`,
    );
  } else {
    providerMessageId = `dev-stub-${invoice.id}`;
    const reason = !resend ? "No RESEND_API_KEY configured" : "customer has no email on file";
    console.log(
      `[dev email stub] Would send ${invoice.invoiceNumber} to ${recipientEmail ?? "(no email on file)"}` +
        ` — ${pdfBuffer.length}-byte PDF attached. ${reason}, so nothing was actually delivered.`,
    );
  }

  await prisma.emailEvent.create({
    data: {
      accountId: invoice.accountId,
      invoiceId: invoice.id,
      providerMessageId,
      eventType: "SENT",
      recipientEmail: recipientEmail ?? "unknown",
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
  await maybeScheduleOverdueSweep();
  const job = await claimNextJob();
  if (job) {
    await runJob(job);
  }
  setTimeout(pollLoop, POLL_INTERVAL_MS);
}

// Only start polling when this file is run as the actual entrypoint, not
// when its exported functions are imported directly (e.g. by
// sendInvoiceEmail.test.ts) — otherwise importing this module for testing
// would kick off an infinite background loop against the test database.
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  console.log("jobs-runner started, polling every", POLL_INTERVAL_MS, "ms");
  pollLoop();
}
