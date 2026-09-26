import { z } from "zod";
import { jobLocationTypeSchema, jobStatusSchema } from "./enums.js";

export const createJobSchema = z.object({
  customerId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  locationType: jobLocationTypeSchema.optional(),
  scheduledStart: z.coerce.date().optional(),
  scheduledEnd: z.coerce.date().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
  notes: z.string().optional(),
});
export type CreateJobInput = z.infer<typeof createJobSchema>;

export const updateJobSchema = createJobSchema.partial().omit({ customerId: true });
export type UpdateJobInput = z.infer<typeof updateJobSchema>;

export const updateJobStatusSchema = z.object({
  status: jobStatusSchema,
});
export type UpdateJobStatusInput = z.infer<typeof updateJobStatusSchema>;

export const createJobMaterialSchema = z.object({
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().nonnegative(),
});
export type CreateJobMaterialInput = z.infer<typeof createJobMaterialSchema>;
