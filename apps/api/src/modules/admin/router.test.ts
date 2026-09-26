import "../../env.js";
import "express-async-errors";
import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { adminRouter } from "./router.js";
import { customersRouter } from "../customers/router.js";
import { requireAdminRole } from "../../middleware/requireAdmin.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { adminPrisma, privilegedPrisma } from "../../lib/db.js";
import { DEV_ACCOUNT_AUTH_ID, ensureDevAccount } from "../../lib/devAuth.js";

const app = express();
app.use(express.json());
app.use("/admin", adminRouter);
app.use("/api/customers", customersRouter);
app.use(errorHandler);

let accountId: string;

beforeAll(async () => {
  accountId = (await ensureDevAccount(DEV_ACCOUNT_AUTH_ID)).id;
});

// A minimal SENT invoice under the dev account, written with the owner role
// (fixtures aren't what's under test).
async function createSentInvoice() {
  const customer = await privilegedPrisma.customer.create({
    data: { accountId, name: "Admin test customer" },
  });
  const job = await privilegedPrisma.job.create({
    data: { accountId, customerId: customer.id, title: "Admin test job" },
  });
  return privilegedPrisma.invoice.create({
    data: {
      accountId,
      jobId: job.id,
      customerId: customer.id,
      invoiceNumber: `ADM-${randomUUID().slice(0, 8)}`,
      status: "SENT",
      subtotal: 100,
      taxRate: 0.2,
      taxAmount: 20,
      total: 120,
    },
  });
}

function sendJob(
  invoiceId: string,
  status: "FAILED" | "SUCCEEDED" | "PENDING",
) {
  return privilegedPrisma.backgroundJob.create({
    data: {
      accountId,
      type: "SEND_INVOICE_EMAIL",
      payload: { invoiceId },
      status,
      lastError: status === "FAILED" ? "Resend said no" : null,
    },
  });
}

describe("GET /admin/me", () => {
  it("identifies the admin and their role", async () => {
    const res = await request(app).get("/admin/me");
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("SUPERADMIN");
  });
});

describe("GET /admin/accounts", () => {
  it("lists accounts with metadata counts that match the real data", async () => {
    const res = await request(app).get("/admin/accounts");
    expect(res.status).toBe(200);
    const row = res.body.find((a: { id: string }) => a.id === accountId);
    expect(row).toBeDefined();
    expect(row.customerCount).toBe(
      await privilegedPrisma.customer.count({
        where: { accountId, deletedAt: null },
      }),
    );
    expect(row.jobCount).toBe(
      await privilegedPrisma.job.count({
        where: { accountId, deletedAt: null },
      }),
    );
    expect(row.invoiceCount).toBe(
      await privilegedPrisma.invoice.count({ where: { accountId } }),
    );
    // Metadata only — no bank details, phone, address.
    expect(row).not.toHaveProperty("bankSortCode");
    expect(row).not.toHaveProperty("contactPhone");
  });

  it("filters by business name or email, case-insensitively", async () => {
    const res = await request(app)
      .get("/admin/accounts")
      .query({ q: "DEV@EXAMPLE" });
    expect(res.status).toBe(200);
    expect(res.body.some((a: { id: string }) => a.id === accountId)).toBe(true);
    const none = await request(app)
      .get("/admin/accounts")
      .query({ q: `nobody-${randomUUID()}` });
    expect(none.body).toEqual([]);
  });
});

describe("GET /admin/accounts/:id/summary", () => {
  it("returns counts and states, and records that it was viewed", async () => {
    const invoice = await createSentInvoice();
    await sendJob(invoice.id, "FAILED");
    const before = await privilegedPrisma.adminAuditLog.count({
      where: { targetAccountId: accountId, action: "ACCOUNT_SUMMARY_VIEWED" },
    });

    const res = await request(app).get(`/admin/accounts/${accountId}/summary`);
    expect(res.status).toBe(200);
    expect(res.body.account.id).toBe(accountId);
    expect(res.body.customerCount).toBe(
      await privilegedPrisma.customer.count({
        where: { accountId, deletedAt: null },
      }),
    );
    expect(res.body.invoicesByStatus.SENT).toBeGreaterThanOrEqual(1);
    expect(res.body.recentInvoices.length).toBeLessThanOrEqual(10);

    const shown = res.body.recentInvoices.find(
      (i: { id: string }) => i.id === invoice.id,
    );
    expect(shown).toMatchObject({
      invoiceNumber: invoice.invoiceNumber,
      status: "SENT",
    });
    expect(shown.email).toMatchObject({
      status: "FAILED",
      lastError: "Resend said no",
    });
    // No money amounts or customer/job content anywhere in the payload.
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("Admin test customer");
    expect(body).not.toContain("Admin test job");
    expect(shown).not.toHaveProperty("total");

    const after = await privilegedPrisma.adminAuditLog.count({
      where: { targetAccountId: accountId, action: "ACCOUNT_SUMMARY_VIEWED" },
    });
    expect(after).toBe(before + 1);
  });

  it("404s for an unknown account without writing an audit row", async () => {
    const id = randomUUID();
    const res = await request(app).get(`/admin/accounts/${id}/summary`);
    expect(res.status).toBe(404);
    expect(
      await privilegedPrisma.adminAuditLog.count({
        where: { targetAccountId: id },
      }),
    ).toBe(0);
  });
});

describe("POST /admin/support/resend-invoice-email", () => {
  it("re-queues a failed send and audits it", async () => {
    const invoice = await createSentInvoice();
    await sendJob(invoice.id, "FAILED");

    const res = await request(app)
      .post("/admin/support/resend-invoice-email")
      .send({ invoiceId: invoice.id });
    expect(res.status).toBe(202);

    const jobs = await privilegedPrisma.backgroundJob.findMany({
      where: {
        accountId,
        type: "SEND_INVOICE_EMAIL",
        payload: { path: ["invoiceId"], equals: invoice.id },
      },
      orderBy: { createdAt: "desc" },
    });
    expect(jobs[0]!.status).toBe("PENDING");
    const audit = await privilegedPrisma.adminAuditLog.findFirst({
      where: {
        action: "INVOICE_EMAIL_RESENT",
        targetAccountId: accountId,
        metadata: { path: ["invoiceId"], equals: invoice.id },
      },
    });
    expect(audit).not.toBeNull();

    // The retry is now in flight — a second click must not queue another.
    const again = await request(app)
      .post("/admin/support/resend-invoice-email")
      .send({ invoiceId: invoice.id });
    expect(again.status).toBe(409);
  });

  it("refuses when the email already sent", async () => {
    const invoice = await createSentInvoice();
    await sendJob(invoice.id, "SUCCEEDED");
    const res = await request(app)
      .post("/admin/support/resend-invoice-email")
      .send({ invoiceId: invoice.id });
    expect(res.status).toBe(409);
  });

  it("refuses a draft the account hasn't sent yet", async () => {
    const invoice = await createSentInvoice();
    await privilegedPrisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "DRAFT" },
    });
    const res = await request(app)
      .post("/admin/support/resend-invoice-email")
      .send({ invoiceId: invoice.id });
    expect(res.status).toBe(409);
  });

  it("404s for an unknown invoice and 400s for a malformed id", async () => {
    expect(
      (
        await request(app)
          .post("/admin/support/resend-invoice-email")
          .send({ invoiceId: randomUUID() })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post("/admin/support/resend-invoice-email")
          .send({ invoiceId: "nope" })
      ).status,
    ).toBe(400);
  });
});

describe("GET /admin/audit-logs", () => {
  it("lists recent entries with the admin and target account named", async () => {
    await request(app).get(`/admin/accounts/${accountId}/summary`);
    const res = await request(app).get("/admin/audit-logs").query({ limit: 5 });
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.length).toBeLessThanOrEqual(5);
    expect(res.body[0]).toMatchObject({ adminEmail: "dev-admin@example.test" });
  });

  it("is refused for a role below SUPERADMIN", async () => {
    const restricted = express();
    restricted.use((req, _res, next) => {
      req.adminRole = "SUPPORT";
      next();
    });
    restricted.get("/x", requireAdminRole("SUPERADMIN"), (_req, res) => {
      res.json({ ok: true });
    });
    expect((await request(restricted).get("/x")).status).toBe(403);
  });
});

describe("the hephaste_admin database role itself", () => {
  it("can count across tenants (BYPASSRLS)", async () => {
    const rows = await adminPrisma().$queryRaw<
      { n: bigint }[]
    >`SELECT count(*) AS n FROM jobs`;
    expect(Number(rows[0]!.n)).toBe(await privilegedPrisma.job.count());
  });

  it.each([
    ["customer names", "SELECT name FROM customers LIMIT 1"],
    ["job titles", "SELECT title FROM jobs LIMIT 1"],
    ["invoice totals", "SELECT total FROM invoices LIMIT 1"],
    ["account bank details", "SELECT bank_sort_code FROM accounts LIMIT 1"],
    ["job notes", "SELECT body FROM job_notes LIMIT 1"],
    ["attachments", "SELECT file_url FROM attachments LIMIT 1"],
  ])(
    "cannot read %s — permission denied at the database, not just in code",
    async (_label, sql) => {
      await expect(adminPrisma().$queryRawUnsafe(sql)).rejects.toThrow(
        /permission denied/i,
      );
    },
  );
});
