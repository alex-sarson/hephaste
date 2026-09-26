// Admin authorization is deliberately a separate code path from
// resolveAccount (tenantScope.ts). Admins sign in exactly like everyone else
// — the one Clerk instance — but being an admin is decided solely by a row in
// the `admins` table keyed by the Clerk user id: a valid session alone grants
// nothing, and no tenant-facing code can create or alter those rows (only the
// out-of-band `pnpm admin:grant` script can). This middleware never sets the
// tenant RLS session variable; admin routes read cross-tenant metadata
// through the metadata-only hephaste_admin DB role (lib/db.ts adminPrisma).
import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "@clerk/backend";
import { prisma } from "../lib/db.js";
import { ensureDevAdmin, isDevAuthEnabled } from "../lib/devAuth.js";

declare global {
  namespace Express {
    interface Request {
      adminId?: string;
      adminRole?: "SUPPORT" | "BILLING_OPS" | "SUPERADMIN";
    }
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (isDevAuthEnabled()) {
    // See lib/devAuth.ts — local-only, never active in production.
    const admin = await ensureDevAdmin();
    req.adminId = admin.id;
    req.adminRole = admin.role;
    next();
    return;
  }

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

    const admin = await prisma.admin.findUnique({
      where: { authProviderId: claims.sub },
      select: { id: true, role: true },
    });

    if (!admin) {
      // Same response whether the row is missing or the user is an ordinary
      // customer: nothing here should confirm which identities are admins.
      res.status(403).json({ error: "Not an administrator" });
      return;
    }

    req.adminId = admin.id;
    req.adminRole = admin.role;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired session", detail: (err as Error).message });
  }
}

/** Use after requireAdmin: 403 unless the admin holds one of `roles`. */
export function requireAdminRole(...roles: NonNullable<Request["adminRole"]>[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.adminRole || !roles.includes(req.adminRole)) {
      res.status(403).json({ error: "Your admin role doesn't permit this" });
      return;
    }
    next();
  };
}
