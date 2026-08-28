// Pure money math. No DB access, no I/O — see brief §4: this is the
// highest financial-correctness-risk code in the product, kept isolated and
// heavily unit-tested for exactly that reason.
//
// All arithmetic is done in integer cents/pence to avoid floating-point
// rounding errors (e.g. 0.1 + 0.2 !== 0.3), then converted back to decimal
// pounds at the boundary.

export interface LineItemAmount {
  quantity: number;
  unitPrice: number;
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function lineTotal(item: LineItemAmount): number {
  return fromCents(toCents(item.quantity) * toCents(item.unitPrice) / 100);
}

export interface InvoiceTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
}

/**
 * Computes subtotal/tax/total for a set of line items and a tax rate
 * (expressed as a fraction, e.g. 0.2 for 20% VAT).
 */
export function calculateInvoiceTotals(
  lineItems: LineItemAmount[],
  taxRate: number,
): InvoiceTotals {
  const subtotalCents = lineItems.reduce(
    (sum, item) => sum + toCents(lineTotal(item)),
    0,
  );
  const taxCents = Math.round(subtotalCents * taxRate);
  const totalCents = subtotalCents + taxCents;

  return {
    subtotal: fromCents(subtotalCents),
    taxAmount: fromCents(taxCents),
    total: fromCents(totalCents),
  };
}

/**
 * Whether an invoice should be flagged overdue. Deliberately a pure function
 * of (status, dueDate, now) rather than a stored enum value — see brief §4
 * on why "engagement" and "needs action" are kept as separate axes.
 */
export function isOverdue(
  status: "DRAFT" | "SENT" | "VIEWED" | "PAID" | "VOID",
  dueDate: Date | null,
  now: Date = new Date(),
): boolean {
  if (!dueDate) return false;
  if (status !== "SENT" && status !== "VIEWED") return false;
  return dueDate.getTime() < now.getTime();
}
