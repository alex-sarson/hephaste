import { describe, expect, it } from "vitest";
import { calculateInvoiceTotals, isOverdue, lineTotal } from "./totals.js";

describe("lineTotal", () => {
  it("multiplies quantity by unit price", () => {
    expect(lineTotal({ quantity: 3, unitPrice: 12.5 })).toBe(37.5);
  });

  it("avoids classic floating point drift", () => {
    expect(lineTotal({ quantity: 0.1, unitPrice: 0.2 })).toBeCloseTo(0.02, 5);
  });
});

describe("calculateInvoiceTotals", () => {
  it("computes subtotal, tax and total for a 20% VAT rate", () => {
    const totals = calculateInvoiceTotals(
      [
        { quantity: 2, unitPrice: 50 }, // 100
        { quantity: 1, unitPrice: 25.5 }, // 25.5
      ],
      0.2,
    );
    expect(totals.subtotal).toBe(125.5);
    expect(totals.taxAmount).toBe(25.1);
    expect(totals.total).toBe(150.6);
  });

  it("handles a zero tax rate", () => {
    const totals = calculateInvoiceTotals([{ quantity: 1, unitPrice: 10 }], 0);
    expect(totals).toEqual({ subtotal: 10, taxAmount: 0, total: 10 });
  });

  it("handles no line items", () => {
    const totals = calculateInvoiceTotals([], 0.2);
    expect(totals).toEqual({ subtotal: 0, taxAmount: 0, total: 0 });
  });
});

describe("isOverdue", () => {
  const now = new Date("2026-01-15T00:00:00Z");

  it("is false for a draft invoice regardless of due date", () => {
    expect(isOverdue("DRAFT", new Date("2026-01-01"), now)).toBe(false);
  });

  it("is true for a sent invoice past its due date", () => {
    expect(isOverdue("SENT", new Date("2026-01-01"), now)).toBe(true);
  });

  it("is false for a sent invoice not yet due", () => {
    expect(isOverdue("SENT", new Date("2026-02-01"), now)).toBe(false);
  });

  it("is false once paid, even if past due date", () => {
    expect(isOverdue("PAID", new Date("2026-01-01"), now)).toBe(false);
  });

  it("is false with no due date set", () => {
    expect(isOverdue("SENT", null, now)).toBe(false);
  });
});
