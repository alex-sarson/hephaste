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
import { prisma } from "../lib/db.js";

declare global {
  namespace Express {
    interface Request {
      accountId?: string;
    }
  }
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
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  try {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      throw new Error("CLERK_SECRET_KEY is not configured");
    }

    const claims = await verifyToken(token, { secretKey });

    const account = await prisma.account.findUnique({
      where: { authProviderId: claims.sub },
      select: { id: true },
    });

    if (!account) {
      res.status(403).json({ error: "No account provisioned for this session" });
      return;
    }

    req.accountId = account.id;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired session", detail: (err as Error).message });
  }
}
