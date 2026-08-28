// Local dev seed data. Run with `pnpm db:seed` (wired via prisma.seed in
// package.json). Seeds the same stub Account used by the dev auth bypass
// (AUTH_MODE=dev, see apps/api/src/lib/devAuth.ts — DEV_ACCOUNT_AUTH_ID
// duplicated here since packages/db doesn't depend on apps/api) plus a
// couple of stub customers so the UI isn't empty on first load.
import { PrismaClient } from "../generated/client/index.js";

const DEV_ACCOUNT_AUTH_ID = "dev-local-account";

const prisma = new PrismaClient();

async function main() {
  const account = await prisma.account.upsert({
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
  });

  const stubCustomers = [
    { name: "Jane Homeowner", email: "jane@example.test", city: "Bristol" },
    { name: "Riverside Cafe", email: "accounts@riversidecafe.test", city: "Bristol" },
  ];

  for (const customer of stubCustomers) {
    const existing = await prisma.customer.findFirst({
      where: { accountId: account.id, name: customer.name },
    });
    if (!existing) {
      await prisma.customer.create({ data: { ...customer, accountId: account.id } });
    }
  }

  console.warn(`Seeded dev account ${account.id} with ${stubCustomers.length} stub customer(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
