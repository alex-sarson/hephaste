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
// A second fixed identity, used only by cross-tenant isolation tests (see
// tenantScope.ts's `x-dev-account: 2` header and
// src/tenantIsolation.test.ts) — lets those tests exercise two genuinely
// different accountIds through the real middleware/router chain without
// touching the Clerk path at all. Never selected by anything the browser
// sends.
export const DEV_ACCOUNT_AUTH_ID_2 = "dev-local-account-2";
export const DEV_ADMIN_AUTH_ID = "dev-local-admin";

export function isDevAuthEnabled(): boolean {
  return process.env.AUTH_MODE === "dev" && process.env.NODE_ENV !== "production";
}

/**
 * Idempotently creates (or fetches) a stub Account for local testing,
 * matching the fixed identity the web app's dev-mode auth client sends by
 * default. `authProviderId` defaults to the one identity every existing
 * caller already expects — passing DEV_ACCOUNT_AUTH_ID_2 gets the second
 * tenant used only by isolation tests.
 */
export async function ensureDevAccount(authProviderId: string = DEV_ACCOUNT_AUTH_ID): Promise<{ id: string }> {
  return prisma.account.upsert({
    where: { authProviderId },
    update: {},
    create: {
      authProviderId,
      businessName: authProviderId === DEV_ACCOUNT_AUTH_ID ? "Dev Trades Co." : "Dev Trades Co. (Tenant B)",
      contactEmail: authProviderId === DEV_ACCOUNT_AUTH_ID ? "dev@example.test" : "dev-b@example.test",
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
