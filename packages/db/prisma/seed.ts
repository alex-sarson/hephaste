// Local dev seed data. Run with `pnpm db:seed` (wired via prisma.seed in package.json).
// Intentionally minimal for Phase 0 — extend once the Jobs/Invoices modules exist.
import { PrismaClient } from "../generated/client/index.js";

const prisma = new PrismaClient();

async function main() {
  console.log("Seed script is a Phase 0 placeholder — no seed data yet.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
