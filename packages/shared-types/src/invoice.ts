import { z } from "zod";
import { lineItemTypeSchema } from "./enums.js";

export const invoiceLineItemInputSchema = z.object({
  description: z.string().min(1),
  type: lineItemTypeSchema,
  quantity: z.coerce.number().positive().default(1),
  unitPrice: z.coerce.number().nonnegative(),
  sortOrder: z.number().int().nonnegative(),
});
export type InvoiceLineItemInput = z.infer<typeof invoiceLineItemInputSchema>;

export const createInvoiceSchema = z.object({
  jobId: z.string().uuid(),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

// Only permitted while status = DRAFT — enforced server-side, not just here.
export const updateInvoiceSchema = z.object({
  dueDate: z.coerce.date().optional(),
  taxRate: z.coerce.number().min(0).max(1).optional(),
  notesToCustomer: z.string().optional(),
  lineItems: z.array(invoiceLineItemInputSchema).min(1).optional(),
});
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

export const markInvoicePaidSchema = z.object({
  amountPaid: z.coerce.number().positive(),
  paidMethod: z.string().min(1),
  paidAt: z.coerce.date().optional(),
});
export type MarkInvoicePaidInput = z.infer<typeof markInvoicePaidSchema>;
