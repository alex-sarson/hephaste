import { z } from "zod";
import { industrySchema, type Industry } from "./enums.js";

interface TerminologyPair {
  singular: string;
  plural: string;
}

interface IndustryPreset {
  job: TerminologyPair;
  customer: TerminologyPair;
  asset: TerminologyPair;
}

// Curated onboarding presets (brief §3a). These only ever prefill the
// onboarding form — the resolved strings a user ends up with are stored
// directly on Account (jobLabelSingular etc.) and are freely editable
// afterward, so this map is never read at request time.
export const INDUSTRY_PRESETS: Record<Industry, IndustryPreset> = {
  TRADES: {
    job: { singular: "Job", plural: "Jobs" },
    customer: { singular: "Customer", plural: "Customers" },
    asset: { singular: "Material", plural: "Materials" },
  },
  BEAUTY: {
    job: { singular: "Appointment", plural: "Appointments" },
    customer: { singular: "Client", plural: "Clients" },
    asset: { singular: "Product", plural: "Products" },
  },
  ARTS: {
    job: { singular: "Commission", plural: "Commissions" },
    customer: { singular: "Client", plural: "Clients" },
    asset: { singular: "Supply", plural: "Supplies" },
  },
  OTHER: {
    job: { singular: "Project", plural: "Projects" },
    customer: { singular: "Client", plural: "Clients" },
    asset: { singular: "Item", plural: "Items" },
  },
};

const label = z.string().min(1).max(40);

export const terminologySchema = z.object({
  jobLabelSingular: label,
  jobLabelPlural: label,
  customerLabelSingular: label,
  customerLabelPlural: label,
  assetLabelSingular: label,
  assetLabelPlural: label,
});
export type TerminologyInput = z.infer<typeof terminologySchema>;

// Submitted once at onboarding, and reused as-is for later Settings edits —
// see apps/api/src/modules/account/router.ts (PATCH /me/terminology).
export const onboardingRequestSchema = terminologySchema.extend({
  industry: industrySchema,
});
export type OnboardingRequestInput = z.infer<typeof onboardingRequestSchema>;

// Company profile / invoicing defaults, editable from Settings (brief §6's
// "account/company profile setup" — the first MVP feature, previously a
// TODO on PATCH /me). All optional: this is a partial update of an
// existing Account row, not a creation payload. Logo upload is excluded —
// unlike every other field here it needs a file-storage decision (same
// shape as the one already deferred for the invoices/email checkpoint),
// not just a text input.
export const updateAccountProfileSchema = z.object({
  businessName: z.string().min(1).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().optional(),
  vatNumber: z.string().optional(),
  defaultTaxRate: z.coerce.number().min(0).max(1).optional(),
  invoiceNumberPrefix: z.string().min(1).max(20).optional(),
  currency: z.string().min(1).max(10).optional(),
  bankAccountName: z.string().optional(),
  bankSortCode: z.string().optional(),
  bankAccountNumber: z.string().optional(),
});
export type UpdateAccountProfileInput = z.infer<typeof updateAccountProfileSchema>;
