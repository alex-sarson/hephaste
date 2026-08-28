// Phase 0 placeholder. Real templates (invoice-sent, payment-reminder) land
// in Phase 1 alongside the Postmark send integration — see brief §9.
// Likely implemented with @react-email/components once that work starts.

export interface InvoiceEmailData {
  businessName: string;
  customerName: string;
  invoiceNumber: string;
  total: number;
  currency: string;
  dueDate: string | null;
  invoicePdfUrl: string;
}

export function renderInvoiceSentEmail(_data: InvoiceEmailData): {
  subject: string;
  html: string;
} {
  throw new Error("Not implemented — Phase 1, see brief §9 (Email Sending & Tracking).");
}
