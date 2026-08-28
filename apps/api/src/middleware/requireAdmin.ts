// Admin auth is deliberately a separate code path from resolveAccount
// (tenantScope.ts) — see brief §5.3. This middleware never sets the tenant
// RLS session variable; admin routes that need cross-tenant metadata use a
// separate `admin_service` DB role instead (see packages/db/README.md).
import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "@clerk/backend";
import { prisma } from "../lib/db.js";

declare global {
  namespace Express {
    interface Request {
      adminId?: string;
      adminRole?: "SUPPORT" | "BILLING_OPS" | "SUPERADMIN";
    }
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  try {
    // Uses a separate Clerk secret key for the admin Clerk instance/app —
    // see brief §5.3 — so a tenant session token can never be mistaken for
    // an admin one.
    const secretKey = process.env.CLERK_ADMIN_SECRET_KEY;
    if (!secretKey) {
      throw new Error("CLERK_ADMIN_SECRET_KEY is not configured");
    }

    const claims = await verifyToken(token, { secretKey });

    const admin = await prisma.admin.findUnique({
      where: { authProviderId: claims.sub },
      select: { id: true, role: true },
    });

    if (!admin) {
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
