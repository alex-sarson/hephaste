// The real (non-dev-bypass) admin path: a valid Clerk session from the ONE
// Clerk instance everyone signs in with is not enough — the user must also
// hold a row in `admins`. verifyToken is mocked (no network); everything else
// is the real middleware and database.
import "../env.js";
import "express-async-errors";
import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/backend", () => ({ verifyToken: vi.fn() }));

import { verifyToken } from "@clerk/backend";
import { requireAdmin } from "./requireAdmin.js";
import { privilegedPrisma } from "../lib/db.js";

const app = express();
app.get("/whoami", requireAdmin, (req, res) => {
  res.json({ id: req.adminId, role: req.adminRole });
});

const verify = vi.mocked(verifyToken);
const original = {
  AUTH_MODE: process.env.AUTH_MODE,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
};

beforeEach(() => {
  process.env.AUTH_MODE = ""; // dev bypass off — exercise the real path
  process.env.CLERK_SECRET_KEY = "sk_test_unit";
  verify.mockReset();
});

afterEach(() => {
  process.env.AUTH_MODE = original.AUTH_MODE;
  if (original.CLERK_SECRET_KEY === undefined)
    delete process.env.CLERK_SECRET_KEY;
  else process.env.CLERK_SECRET_KEY = original.CLERK_SECRET_KEY;
});

describe("requireAdmin with real Clerk sessions", () => {
  it("rejects a request with no token", async () => {
    expect((await request(app).get("/whoami")).status).toBe(401);
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects an invalid session", async () => {
    verify.mockRejectedValue(new Error("bad signature"));
    expect(
      (await request(app).get("/whoami").set("Authorization", "Bearer nope"))
        .status,
    ).toBe(401);
  });

  it("forbids a valid session for a user who isn't an admin", async () => {
    verify.mockResolvedValue({ sub: `user_${randomUUID()}` } as never);
    const res = await request(app)
      .get("/whoami")
      .set("Authorization", "Bearer ok");
    expect(res.status).toBe(403);
  });

  it("admits a valid session for a user with an admin row, with their role, verified against the one Clerk instance", async () => {
    const authProviderId = `user_${randomUUID()}`;
    const admin = await privilegedPrisma.admin.create({
      data: {
        authProviderId,
        email: `${authProviderId}@example.test`,
        role: "BILLING_OPS",
      },
    });
    try {
      verify.mockResolvedValue({ sub: authProviderId } as never);
      const res = await request(app)
        .get("/whoami")
        .set("Authorization", "Bearer ok");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: admin.id, role: "BILLING_OPS" });
      expect(verify).toHaveBeenCalledWith("ok", { secretKey: "sk_test_unit" });
    } finally {
      await privilegedPrisma.admin.delete({ where: { id: admin.id } });
    }
  });

  it("stops being an admin the moment the row is removed", async () => {
    const authProviderId = `user_${randomUUID()}`;
    await privilegedPrisma.admin.create({
      data: {
        authProviderId,
        email: `${authProviderId}@example.test`,
        role: "SUPPORT",
      },
    });
    verify.mockResolvedValue({ sub: authProviderId } as never);
    expect(
      (await request(app).get("/whoami").set("Authorization", "Bearer ok"))
        .status,
    ).toBe(200);
    await privilegedPrisma.admin.delete({ where: { authProviderId } });
    expect(
      (await request(app).get("/whoami").set("Authorization", "Bearer ok"))
        .status,
    ).toBe(403);
  });
});
