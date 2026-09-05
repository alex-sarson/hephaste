import "../env.js";
import { beforeAll, describe, expect, it } from "vitest";
import { sendInvoiceEmail } from "./index.js";
import { prisma } from "../lib/db.js";
import { ensureDevAccount } from "../lib/devAuth.js";
import * as invoicesRepo from "../modules/invoices/repository.js";

let accountId: string;
let customerId: string;

beforeAll(async () => {
  const account = await ensureDevAccount();
  accountId = account.id;
  const customer = await prisma.customer.create({
    data: { accountId, name: "Send Test Customer", email: "customer@example.test" },
  });
  customerId = customer.id;
});

async function createSentInvoice() {
  const job = await prisma.job.create({ data: { accountId, customerId, title: "Job for send test" } });
  const invoice = await invoicesRepo.create(accountId, job.id);
  if (!invoice) throw new Error("setup failed: invoice not created");
  await invoicesRepo.update(accountId, invoice.id, {
    lineItems: [{ description: "Labour", type: "LABOUR", quantity: 1, unitPrice: 100, sortOrder: 0 }],
  });
  await invoicesRepo.transition(accountId, invoice.id, "SENT", "MANUAL_USER");
  return invoice.id;
}

describe("sendInvoiceEmail", () => {
  it("renders a PDF and writes a SENT EmailEvent with a stable providerMessageId", async () => {
    const invoiceId = await createSentInvoice();

    await sendInvoiceEmail({ invoiceId });

    const event = await prisma.emailEvent.findFirst({ where: { invoiceId, eventType: "SENT" } });
    expect(event).not.toBeNull();
    expect(event!.recipientEmail).toBe("customer@example.test");
    expect(event!.providerMessageId).toBe(`dev-stub-${invoiceId}`);
  });

  it("is idempotent — running it again doesn't create a second SENT event", async () => {
    const invoiceId = await createSentInvoice();

    await sendInvoiceEmail({ invoiceId });
    await sendInvoiceEmail({ invoiceId });

    const events = await prisma.emailEvent.findMany({ where: { invoiceId, eventType: "SENT" } });
    expect(events).toHaveLength(1);
  });

  it("does nothing for an invoice that doesn't exist", async () => {
    // Just needs to not throw — the handler logs and returns.
    await expect(sendInvoiceEmail({ invoiceId: "00000000-0000-0000-0000-000000000000" })).resolves.toBeUndefined();
  });
});
