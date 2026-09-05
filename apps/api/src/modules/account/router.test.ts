import "../../env.js";
// Must precede the accountRouter import below — see server.ts for why.
import "express-async-errors";
import express from "express";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
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
