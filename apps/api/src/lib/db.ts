import { PrismaClient } from "@trade-platform/db";

// Single shared Prisma client for the whole API process. The normal app
// connection must have RLS enforced at the database level (FORCE ROW LEVEL
// SECURITY) — see packages/db/README.md and brief §7. A separate,
// rarely-used connection/role with BYPASSRLS is used only by the admin
// module (src/modules/admin), never here.
export const prisma = new PrismaClient();

/**
 * Runs `fn` inside a transaction with the Postgres session variable that
 * every tenant table's RLS policy checks (`app.current_account_id`) set for
 * its duration. This is the mechanism that makes RLS the real backstop it's
 * meant to be — every tenant-scoped request must go through this, not
 * `prisma.$transaction` directly.
 *
 * NOTE: requires the RLS migration described in packages/db/README.md to
 * have been applied; until then this sets a session var that no policy
 * reads yet, and app-layer accountId scoping (see tenantScope.ts) is the
 * only isolation guarantee.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function withTenantScope<T>(
  accountId: string,
  fn: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(accountId)) {
    // Defense in depth: SET LOCAL can't be parameterized, so this string is
    // interpolated directly. Rejecting anything that isn't a UUID shape
    // rules out injection via this path regardless of where accountId
    // originated.
    throw new Error(`Refusing to scope transaction to non-UUID accountId: ${accountId}`);
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_account_id = '${accountId}'`);
    return fn(tx);
  });
}
