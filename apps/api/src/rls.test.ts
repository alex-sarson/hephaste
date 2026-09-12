// Checks the DB-layer backstop (brief §7, packages/db/README.md) in
// isolation, with the app-layer accountId checks every repository
// function makes (see e.g. modules/jobs/repository.ts) bypassed entirely:
// these queries carry NO accountId `where` clause at all, the exact bug
// RLS exists to catch. src/tenantIsolation.test.ts covers both layers
// together, through the real HTTP/router chain — this file exists so a
// regression in Postgres's actual RLS policies (or in the roles/grants
// they depend on) fails on its own, rather than only being incidentally
// covered by that other suite still passing for app-layer reasons.
import "./env.js";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma, privilegedPrisma, withTenantScope } from "./lib/db.js";
import { DEV_ACCOUNT_AUTH_ID, DEV_ACCOUNT_AUTH_ID_2, ensureDevAccount } from "./lib/devAuth.js";

let accountA: string;
let accountB: string;
let jobA: string;

beforeAll(async () => {
  accountA = (await ensureDevAccount(DEV_ACCOUNT_AUTH_ID)).id;
  accountB = (await ensureDevAccount(DEV_ACCOUNT_AUTH_ID_2)).id;

  // A customer + job created directly under account A, scoped correctly —
  // this is the row every test below tries to see/touch from account B
  // (or from no scope at all) with no accountId filter of its own.
  const customer = await withTenantScope(accountA, () =>
    prisma.customer.create({ data: { accountId: accountA, name: `RLS test customer ${randomUUID()}` } }),
  );
  jobA = (
    await withTenantScope(accountA, () =>
      prisma.job.create({ data: { accountId: accountA, customerId: customer.id, title: "RLS test job" } }),
    )
  ).id;
});

describe("Postgres RLS (the DB-layer backstop, independent of app-layer checks)", () => {
  it("an unscoped query (no withTenantScope, no accountId filter) sees nothing — fails closed", async () => {
    // prisma with no active scope falls back to the plain restricted
    // (non-owner) connection — see lib/db.ts. No `where` at all: if RLS
    // weren't enforcing anything, this would return every account's jobs.
    const jobs = await prisma.job.findMany({});
    expect(jobs).toHaveLength(0);
  });

  it("scoped to a different account, a query with no accountId filter still can't see the row", async () => {
    const jobs = await withTenantScope(accountB, () => prisma.job.findMany({}));
    expect(jobs.find((j) => j.id === jobA)).toBeUndefined();
  });

  it("scoped to the owning account, the same unfiltered query sees the row", async () => {
    const jobs = await withTenantScope(accountA, () => prisma.job.findMany({}));
    expect(jobs.find((j) => j.id === jobA)).toBeDefined();
  });

  it("WITH CHECK blocks writing a row stamped with a different account's id than the active scope", async () => {
    const customerA = await withTenantScope(accountA, () =>
      prisma.customer.create({ data: { accountId: accountA, name: "WITH CHECK setup customer" } }),
    );
    // Scoped to B, but the row itself claims to belong to A — the policy's
    // WITH CHECK clause (not just USING) is what rejects this, not any
    // application code.
    await expect(
      withTenantScope(accountB, () =>
        prisma.job.create({ data: { accountId: accountA, customerId: customerA.id, title: "should never insert" } }),
      ),
    ).rejects.toThrow();
  });

  it("privilegedPrisma (the owner role) bypasses RLS entirely, by design", async () => {
    // The connection genuinely cross-tenant system code uses (the overdue
    // sweep, the background-job queue) — see jobs-runner/index.ts. No
    // scope needed or possible; it just sees everything.
    const jobs = await privilegedPrisma.job.findMany({ where: { id: jobA } });
    expect(jobs).toHaveLength(1);
  });
});
