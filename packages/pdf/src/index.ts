// Phase 0 placeholder. Real invoice PDF rendering (likely
// @react-pdf/renderer, given the rest of the stack is React/TS) lands in
// Phase 1 alongside invoice creation — see brief §6 and §9.

export interface InvoicePdfData {
  accountId: string;
  invoiceId: string;
  // Extended once the Invoice module's shape is finalized in Phase 1.
}

export async function renderInvoicePdf(_data: InvoicePdfData): Promise<Buffer> {
  throw new Error("Not implemented — Phase 1, see brief §6 (Feature Scope: PDF generation).");
}
