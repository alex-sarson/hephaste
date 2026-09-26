import "../../env.js";
// Must precede the accountRouter import below — see server.ts for why.
import "express-async-errors";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accountRouter } from "./router.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { prisma } from "../../lib/db.js";
import { DEV_ACCOUNT_AUTH_ID } from "../../lib/devAuth.js";

// Exercises the real resolveAccount dev-auth bypass (AUTH_MODE=dev, see
// .env) against the real dev Postgres — not a mocked Prisma client — since
// this endpoint's whole job is a stateful gate (onboardingCompletedAt).
const app = express();
app.use(express.json());
app.use("/api/account", accountRouter);
app.use(errorHandler);

const validBody = {
  industry: "BEAUTY",
  jobLabelSingular: "Appointment",
  jobLabelPlural: "Appointments",
  customerLabelSingular: "Client",
  customerLabelPlural: "Clients",
  assetLabelSingular: "Product",
  assetLabelPlural: "Products",
};

beforeAll(async () => {
  // Start every run from a clean "not yet onboarded" state regardless of
  // what a previous run (or manual dev testing) left behind.
  await prisma.account.updateMany({
    where: { authProviderId: DEV_ACCOUNT_AUTH_ID },
    data: { onboardingCompletedAt: null, industry: "OTHER" },
  });
});

describe("PATCH /api/account/me/terminology", () => {
  it("rejects an empty label", async () => {
    const res = await request(app)
      .patch("/api/account/me/terminology")
      .send({ ...validBody, jobLabelSingular: "" });
    expect(res.status).toBe(400);
  });

  it("sets onboardingCompletedAt on first call", async () => {
    const res = await request(app).patch("/api/account/me/terminology").send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.onboardingCompletedAt).not.toBeNull();
    expect(res.body.jobLabelSingular).toBe("Appointment");
  });

  it("preserves onboardingCompletedAt and still updates labels on a later call", async () => {
    const first = await request(app).patch("/api/account/me/terminology").send(validBody);
    const firstCompletedAt = first.body.onboardingCompletedAt;

    const second = await request(app)
      .patch("/api/account/me/terminology")
      .send({ ...validBody, jobLabelSingular: "Booking", jobLabelPlural: "Bookings" });

    expect(second.status).toBe(200);
    expect(second.body.onboardingCompletedAt).toBe(firstCompletedAt);
    expect(second.body.jobLabelSingular).toBe("Booking");
  });
});

describe("PATCH /api/account/me", () => {
  it("updates the invoice number prefix and other profile fields", async () => {
    const res = await request(app).patch("/api/account/me").send({
      invoiceNumberPrefix: "QUOTE-",
      defaultTaxRate: 0.15,
      businessName: "Renamed Co.",
    });
    expect(res.status).toBe(200);
    expect(res.body.invoiceNumberPrefix).toBe("QUOTE-");
    expect(res.body.defaultTaxRate).toBe("0.15");
    expect(res.body.businessName).toBe("Renamed Co.");
  });

  it("rejects an out-of-range tax rate", async () => {
    const res = await request(app).patch("/api/account/me").send({ defaultTaxRate: 1.5 });
    expect(res.status).toBe(400);
  });

  it("leaves fields not included in the request untouched", async () => {
    await request(app).patch("/api/account/me").send({ invoiceNumberPrefix: "PARTIAL-" });
    const res = await request(app).patch("/api/account/me").send({ businessName: "Still Renamed Co." });
    expect(res.body.invoiceNumberPrefix).toBe("PARTIAL-");
    expect(res.body.businessName).toBe("Still Renamed Co.");
  });

  // Defensive, not the actual fix for cross-file interleaving (see
  // vitest.config.ts's fileParallelism: false) — restores the shared
  // dev-account row's fields to what other test files' fixtures assume,
  // in case this file ever runs in isolation or a future test elsewhere
  // depends on the seeded defaults.
  afterAll(async () => {
    await prisma.account.updateMany({
      where: { authProviderId: DEV_ACCOUNT_AUTH_ID },
      data: { businessName: "Dev Trades Co.", defaultTaxRate: 0.2, invoiceNumberPrefix: "INV-" },
    });
  });
});
