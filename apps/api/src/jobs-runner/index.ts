// Background worker process — see brief §10. Deployed as a second small
// process/service (`pnpm --filter @trade-platform/api jobs-runner`),
// separate from the HTTP server, polling the BackgroundJob table.
//
// Phase 0: polling loop + the DETECT_OVERDUE sweep (the simplest job type,
// good smoke test that the pattern works end-to-end). SEND_INVOICE_EMAIL and
// SEND_REMINDER handlers land in Phase 1 alongside the invoices module.
import "../env.js";
import { prisma } from "../lib/db.js";

const POLL_INTERVAL_MS = 5000;

async function detectOverdue() {
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
      case "SEND_REMINDER":
        throw new Error(`Job type ${job.type} not implemented until Phase 1`);
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: { status: "SUCCEEDED" },
    });
  } catch (err) {
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
// on a schedule — not wired here yet (Phase 1).

console.log("jobs-runner started, polling every", POLL_INTERVAL_MS, "ms");
pollLoop();
