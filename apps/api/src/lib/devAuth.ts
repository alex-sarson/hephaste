// Local-only auth bypass for testing the app without a real Clerk account.
// Enabled by setting AUTH_MODE=dev (see .env.example). NEVER wire this into
// a deployed environment — the guard below refuses to activate it when
// NODE_ENV=production regardless of AUTH_MODE, as a backstop against a
// misconfigured env var.
//
// This exists purely so the tenant-scoped API + PWA can be exercised
// end-to-end (sign-in -> account -> customers) without external
// dependencies. The real path (apps/api/src/middleware/tenantScope.ts,
// requireAdmin.ts) is Clerk token verification — this is not a replacement
// for it, just a dev convenience.
import { prisma } from "./db.js";

export const DEV_ACCOUNT_AUTH_ID = "dev-local-account";
export const DEV_ADMIN_AUTH_ID = "dev-local-admin";

export function isDevAuthEnabled(): boolean {
  return process.env.AUTH_MODE === "dev" && process.env.NODE_ENV !== "production";
}

/**
 * Idempotently creates (or fetches) a single stub Account for local testing,
 * matching the fixed identity the web app's dev-mode auth client sends.
 */
export async function ensureDevAccount(): Promise<{ id: string }> {
  return prisma.account.upsert({
    where: { authProviderId: DEV_ACCOUNT_AUTH_ID },
    update: {},
    create: {
      authProviderId: DEV_ACCOUNT_AUTH_ID,
      businessName: "Dev Trades Co.",
      contactEmail: "dev@example.test",
      defaultTaxRate: 0.2,
      invoiceNumberPrefix: "INV-",
      currency: "GBP",
    },
    select: { id: true },
  });
}

export async function ensureDevAdmin(): Promise<{ id: string; role: "SUPPORT" | "BILLING_OPS" | "SUPERADMIN" }> {
  return prisma.admin.upsert({
    where: { authProviderId: DEV_ADMIN_AUTH_ID },
    update: {},
    create: {
      authProviderId: DEV_ADMIN_AUTH_ID,
      email: "dev-admin@example.test",
      role: "SUPERADMIN",
    },
    select: { id: true, role: true },
  });
}
