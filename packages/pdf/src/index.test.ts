import { describe, expect, it } from "vitest";
import { renderInvoicePdf, type InvoicePdfData } from "./index.js";

const sample: InvoicePdfData = {
  business: { name: "Dev Trades Co.", addressLine1: "12 Foundry Yard", city: "Bristol", postcode: "BS1 4QT", email: "dev@example.test" },
  customer: { name: "Aldridge Construction", addressLine1: "14 Elm Grove", city: "Bristol", postcode: "BS8 2QY" },
  invoiceNumber: "INV-0001",
  issueDate: new Date("2026-08-29"),
  dueDate: new Date("2026-09-12"),
  lineItems: [
    { description: "Consumer unit upgrade", type: "LABOUR", quantity: 1, unitPrice: 480, lineTotal: 480 },
    { description: "18-way consumer unit", type: "MATERIALS", quantity: 1, unitPrice: 165, lineTotal: 165 },
  ],
  subtotal: 645,
  taxRate: 0.2,
  taxAmount: 129,
  total: 774,
  notesToCustomer: "Payment due within 14 days.",
};

describe("renderInvoicePdf", () => {
  it("produces a non-empty PDF buffer", async () => {
    const buffer = await renderInvoicePdf(sample);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(500);
    // %PDF- magic bytes — a cheap sanity check that this is actually a PDF
    // and not, say, an empty or error buffer.
    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("still renders with no notes and no bank details", async () => {
    const buffer = await renderInvoicePdf({ ...sample, notesToCustomer: null });
    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
