import type {
  InvoiceLineItemInput,
  InvoiceStatus,
  LineItemType,
  MarkInvoicePaidInput,
  TriggerSource,
} from "@trade-platform/shared-types";
import { request } from "./client.js";

export interface InvoiceLineItem {
  id: string;
  description: string;
  type: LineItemType;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  sortOrder: number;
}

export interface InvoiceStatusEvent {
  id: string;
  fromStatus: InvoiceStatus | null;
  toStatus: InvoiceStatus;
  triggeredBy: TriggerSource;
  createdAt: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  overdue: boolean;
  issueDate: string | null;
  dueDate: string | null;
  subtotal: string;
  taxRate: string;
  taxAmount: string;
  total: string;
  amountPaid: string;
  paidAt: string | null;
  paidMethod: string | null;
  notesToCustomer: string | null;
  sentAt: string | null;
  voidedAt: string | null;
  createdAt: string;
  customer: { id: string; name: string; email: string | null; phone: string | null };
  job: { id: string; title: string };
  lineItems: InvoiceLineItem[];
  statusEvents: InvoiceStatusEvent[];
}

export function listInvoices(token: string) {
  return request<Invoice[]>("/api/invoices", { method: "GET", token });
}

export function getInvoice(token: string, id: string) {
  return request<Invoice>(`/api/invoices/${id}`, { method: "GET", token });
}

export function createInvoice(token: string, jobId: string) {
  return request<Invoice>("/api/invoices", {
    method: "POST",
    token,
    body: JSON.stringify({ jobId }),
  });
}

export function updateInvoice(
  token: string,
  id: string,
  input: { lineItems?: InvoiceLineItemInput[]; dueDate?: string; notesToCustomer?: string },
) {
  return request<Invoice>(`/api/invoices/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(input),
  });
}

export function sendInvoice(token: string, id: string) {
  return request<Invoice>(`/api/invoices/${id}/send`, { method: "POST", token });
}

export function markInvoicePaid(token: string, id: string, input: MarkInvoicePaidInput) {
  return request<Invoice>(`/api/invoices/${id}/mark-paid`, {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export function voidInvoice(token: string, id: string) {
  return request<Invoice>(`/api/invoices/${id}/void`, { method: "POST", token });
}
