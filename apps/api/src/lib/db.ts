import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient, type Prisma } from "@hephaste/db";

// Two connections, two roles — see the add_row_level_security migration
// (packages/db/prisma/migrations/) and packages/db/README.md's "Row-Level
// Security" section for the full reasoning. Short version: a table's OWNER
// always bypasses RLS regardless of FORCE ROW LEVEL SECURITY, so the role
// that runs migrations (and therefore owns every table) can't be the one
// normal tenant traffic connects as.

// The restricted, non-owner role (hephaste_app locally) — every
// per-request query ends up here, via the `prisma` export below. This is
// the connection FORCE ROW LEVEL SECURITY is a real backstop against.
const restrictedPrisma = new PrismaClient({
  datasourceUrl: process.env.APP_DATABASE_URL,
});

// The owner/migration role — bypasses RLS by construction (it owns every
// table). Exported directly (not proxied/scoped) for genuinely
// cross-tenant system code: the jobs-runner's queue processing and
// overdue sweep (see jobs-runner/index.ts), and — once built — admin's
// cross-account queries (brief §5). Never import this to serve a single
// request's tenant-scoped data; use `prisma` for that.
export const privilegedPrisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

// Holds the current request's accountId for the extent of
// withTenantScope's callback — see `prisma` below for what actually uses
// it. Deliberately just the id, not a held-open transaction/connection:
// an earlier version of this file held one transaction open for an
// entire HTTP request (committing on `res.on("finish")`) to give the
// whole request one atomic unit of work, but that introduced a real,
// observed race — the client-visible response can complete before that
// deferred commit has actually reached Postgres, so a test's very next
// request (a fresh connection, reading the same row) could still see
// pre-commit state. Scoping by account id and opening a short-lived
// transaction per Prisma call instead (below) sidesteps that class of bug
// entirely, and doesn't reduce atomicity anywhere in practice: no
// repository function in this codebase relied on request-spanning
// atomicity to begin with — the few that need multiple statements
// together already wrap themselves in an explicit `prisma.$transaction`,
// which this file still honors as one real transaction (see the
// `$transaction` handling below).
const requestScope = new AsyncLocalStorage<string>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Runs `fn` in one transaction with the Postgres session variable every
// tenant table's RLS policy checks (`app.current_account_id`) set for its
// duration, then commits (or rolls back, if `fn` throws) before returning
// — nothing outside this function ever gets a reference to `fn` that
// hasn't already settled, which is exactly what closes the race described
// above.
function runInScope<T>(accountId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(accountId)) {
    // Defense in depth: SET LOCAL can't be parameterized, so this string is
    // interpolated directly. Rejecting anything that isn't a UUID shape
    // rules out injection via this path regardless of where accountId
    // originated.
    throw new Error(`Refusing to scope transaction to non-UUID accountId: ${accountId}`);
  }
  return restrictedPrisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_account_id = '${accountId}'`);
    return fn(tx);
  });
}

// Wraps one model delegate (e.g. the real prisma.job) so every method call
// on it — prisma.job.findMany(...), prisma.job.create(...), etc. — runs in
// its own runInScope transaction, calling the SAME method on the scoped
// transaction client's own delegate for that model (tx.job, tx.customer,
// ...) rather than the unscoped one this Proxy wraps. `modelName` is the
// property key the outer Proxy was accessed with ("job", "customer", ...)
// — passed in explicitly rather than introspected, since Prisma model
// delegates don't expose their own name. Every repository function keeps
// calling `prisma.job.findMany(...)` etc. completely unchanged; this is
// what makes that transparent.
function scopedModel(modelName: PropertyKey, model: object, accountId: string) {
  return new Proxy(model, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) =>
        runInScope(accountId, (tx) => {
          const txRecord = tx as unknown as Record<PropertyKey, Record<PropertyKey, ((...a: unknown[]) => Promise<unknown>) | undefined> | undefined>;
          const method = txRecord[modelName]?.[prop];
          if (!method) {
            return Promise.reject(new Error(`Scoped transaction client has no ${String(modelName)}.${String(prop)}`));
          }
          return method(...args);
        });
    },
  });
}

// The client every tenant-scoped repository/router imports. When
// withTenantScope has an accountId active, every model-delegate method
// call (prisma.job.findMany, prisma.customer.create, ...) runs scoped —
// see scopedModel/runInScope. prisma.$transaction(fn) runs `fn` as one
// real scoped transaction, so the few repository functions that group
// several statements together for their own atomicity keep working
// unchanged. With no active scope, falls back to the plain restricted
// connection, unscoped (dev-auth's account lookup/creation, seed scripts
// — anything intentionally running outside a tenant request; safe
// because those touch only Account, which carries no RLS policy).
export const prisma: PrismaClient = new Proxy(restrictedPrisma, {
  get(target, prop, receiver) {
    const accountId = requestScope.getStore();
    if (!accountId) {
      return Reflect.get(target, prop, receiver);
    }
    if (prop === "$transaction") {
      return (fnOrOps: unknown) =>
        runInScope(accountId, (tx) =>
          typeof fnOrOps === "function"
            ? (fnOrOps as (tx: Prisma.TransactionClient) => Promise<unknown>)(tx)
            : Promise.all(fnOrOps as Promise<unknown>[]),
        );
    }
    const value = Reflect.get(target, prop, receiver);
    // Any other `$`-prefixed method ($queryRaw, $executeRawUnsafe, ...)
    // called directly on `prisma` while scoped isn't used anywhere in
    // this codebase today (the one place that needed raw SQL,
    // jobs-runner's claimNextJob, deliberately uses privilegedPrisma
    // instead — see that file) — falling through here means such a call
    // would run unscoped rather than fail loudly, so if one is ever
    // added, route it through runInScope explicitly rather than relying
    // on this fallback.
    if (typeof prop === "string" && prop.startsWith("$")) {
      return value;
    }
    if (typeof value !== "object" || value === null) {
      return value;
    }
    return scopedModel(prop, value, accountId);
  },
}) as PrismaClient;

/**
 * Runs `fn` with `prisma` (above) scoped to `accountId` for its duration —
 * the mechanism that makes RLS the real backstop it's meant to be, not
 * just a policy that happens to exist.
 * `apps/api/src/middleware/tenantScope.ts` wraps every tenant-facing
 * request in this; jobs-runner and the webhooks handler use it directly
 * for the specific pieces of their own work that are genuinely tied to
 * one account (see those files for why not their whole function).
 */
export async function withTenantScope<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
  if (!UUID_RE.test(accountId)) {
    throw new Error(`Refusing to scope to non-UUID accountId: ${accountId}`);
  }
  return requestScope.run(accountId, fn);
}
