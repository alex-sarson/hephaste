// Shared by the on-demand GET /:id/pdf route and the jobs-runner's
// SEND_INVOICE_EMAIL handler, so the Decimal->number/field-mapping logic
// for @trade-platform/pdf's InvoicePdfData only lives in one place.
import type { InvoicePdfData } from "@trade-platform/pdf";

interface AccountLike {
  businessName: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  contactEmail: string;
  bankAccountName: string | null;
  bankSortCode: string | null;
  bankAccountNumber: string | null;
}

// Decimal fields are typed `unknown` rather than `number | string` — the
// real callers pass Prisma.Decimal instances (a class, not a primitive),
// and `Number(x)` accepts anything at the type level anyway, so this
// keeps both call sites (a live Prisma row, and test fixtures using plain
// numbers) valid without importing Prisma's Decimal type here.
interface InvoiceLike {
  invoiceNumber: string;
  issueDate: Date | null;
  dueDate: Date | null;
  subtotal: unknown;
  taxRate: unknown;
  taxAmount: unknown;
  total: unknown;
  notesToCustomer: string | null;
  customer: { name: string; addressLine1: string | null; addressLine2: string | null; city: string | null; postcode: string | null };
  lineItems: Array<{
    description: string;
    type: string;
    quantity: unknown;
    unitPrice: unknown;
    lineTotal: unknown;
  }>;
}

export function buildInvoicePdfData(invoice: InvoiceLike, account: AccountLike): InvoicePdfData {
  return {
    business: {
      name: account.businessName,
      addressLine1: account.addressLine1,
      addressLine2: account.addressLine2,
      city: account.city,
      postcode: account.postcode,
      email: account.contactEmail,
      bankAccountName: account.bankAccountName,
      bankSortCode: account.bankSortCode,
      bankAccountNumber: account.bankAccountNumber,
    },
    customer: invoice.customer,
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    lineItems: invoice.lineItems.map((li) => ({
      description: li.description,
      type: li.type as InvoicePdfData["lineItems"][number]["type"],
      quantity: Number(li.quantity),
      unitPrice: Number(li.unitPrice),
      lineTotal: Number(li.lineTotal),
    })),
    subtotal: Number(invoice.subtotal),
    taxRate: Number(invoice.taxRate),
    taxAmount: Number(invoice.taxAmount),
    total: Number(invoice.total),
    notesToCustomer: invoice.notesToCustomer,
  };
}
