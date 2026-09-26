// The entire tenant-isolation guarantee of the product starts here — see
// brief §7. Every tenant-facing route (never /admin/*) must run this
// middleware before touching the database.
//
// Two layers, both required (see brief §7.2):
//   1. App layer: this middleware resolves the caller's Account and attaches
//      req.accountId; the repository layer (src/modules/*) requires
//      accountId as a mandatory first argument on every query function.
//   2. DB layer (backstop): apps/api/src/lib/db.ts's withTenantScope() sets
//      the Postgres session variable that RLS policies check, so even a
//      forgotten accountId filter in application code can't leak rows.
import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "@clerk/backend";
import { prisma, withTenantScope } from "../lib/db.js";
import { DEV_ACCOUNT_AUTH_ID, DEV_ACCOUNT_AUTH_ID_2, ensureDevAccount, isDevAuthEnabled } from "../lib/devAuth.js";

declare global {
  namespace Express {
    interface Request {
      accountId?: string;
    }
  }
}

// Runs the rest of the request (every downstream middleware/route handler)
// with `accountId` active for lib/db.ts's `prisma` — see withTenantScope's
// own doc comment for why this is scope-by-id rather than one transaction
// held open for the whole request. AsyncLocalStorage.run's context survives
// every async continuation `next()` kicks off here (that's the whole point
// of ALS), so this can just call `next()` directly rather than waiting on
// the response to finish.
function runScoped(accountId: string, req: Request, next: NextFunction): Promise<void> {
  req.accountId = accountId;
  return withTenantScope(accountId, async () => next());
}

/**
 * Verifies the caller's Clerk session, resolves it to an Account row
 * (creating one on first sign-in via the Clerk webhook flow — see
 * src/modules/account — not here), and attaches `req.accountId`.
 *
 * Returns 401 if there's no valid session, and 403 (not 404 — this is about
 * the caller's own identity, not another tenant's resource) if the session
 * is valid but no Account exists yet for it.
 */
export async function resolveAccount(req: Request, res: Response, next: NextFunction) {
  if (isDevAuthEnabled()) {
    // See lib/devAuth.ts — local-only, never active in production. The
    // web app never sends this header — it exists purely so cross-tenant
    // isolation tests can act as a second, genuinely different account
    // through this same middleware (src/tenantIsolation.test.ts).
    const authProviderId = req.header("x-dev-account") === "2" ? DEV_ACCOUNT_AUTH_ID_2 : DEV_ACCOUNT_AUTH_ID;
    // Account itself carries no RLS policy (it's the tenant boundary, not
    // tenant content — see the add_row_level_security migration), so
    // resolving/creating it ahead of runScoped, outside any tenant
    // transaction, is fine.
    const account = await ensureDevAccount(authProviderId);
    await runScoped(account.id, req, next);
    return;
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  let accountId: string;
  try {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      throw new Error("CLERK_SECRET_KEY is not configured");
    }

    const claims = await verifyToken(token, { secretKey });

    // Account itself carries no RLS policy (see runScoped's comment above),
    // so this lookup-by-authProviderId — which can't have an accountId to
    // scope itself with yet — is fine running unscoped.
    const account = await prisma.account.findUnique({
      where: { authProviderId: claims.sub },
      select: { id: true },
    });

    if (!account) {
      res.status(403).json({ error: "No account provisioned for this session" });
      return;
    }
    accountId = account.id;
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired session", detail: (err as Error).message });
    return;
  }

  // Outside the try/catch above on purpose: a failure here (a downstream
  // route handler's own error, or a genuine DB/transaction problem) is not
  // an auth failure and must not be reported as one — it should reach
  // Express's normal error-handling path (errorHandler.ts) via
  // express-async-errors instead.
  await runScoped(accountId, req, next);
}
