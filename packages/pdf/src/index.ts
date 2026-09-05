// Invoice PDF rendering (brief §6, §9). Uses @react-pdf/renderer, which
// draws PDFs from a React tree in pure JS (no headless browser, no native
// binary) — a good fit given the rest of the stack is React/TS and the
// brief's "small team, minimal ops" bias (see brief §12).
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoiceDocument } from "./InvoiceDocument.js";

export interface InvoicePdfLineItem {
  description: string;
  type: "LABOUR" | "MATERIALS" | "OTHER";
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface InvoicePdfData {
  business: {
    name: string;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    postcode?: string | null;
    email: string;
    bankAccountName?: string | null;
    bankSortCode?: string | null;
    bankAccountNumber?: string | null;
  };
  customer: {
    name: string;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    postcode?: string | null;
  };
  invoiceNumber: string;
  issueDate: Date | null;
  dueDate: Date | null;
  lineItems: InvoicePdfLineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notesToCustomer?: string | null;
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  // Called as a plain function, not JSX (<InvoiceDocument data={data} />) —
  // it has no hooks, so this is safe, and it means renderToBuffer receives
  // the <Document> element it actually requires rather than an element
  // wrapping InvoiceDocument itself.
  return renderToBuffer(InvoiceDocument({ data }));
}
