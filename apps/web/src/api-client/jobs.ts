import type {
  CreateJobInput,
  CreateJobMaterialInput,
  InvoiceStatus,
  JobStatus,
  UpdateJobInput,
} from "@trade-platform/shared-types";
import { request } from "./client.js";

export interface Job {
  id: string;
  title: string;
  description: string | null;
  status: JobStatus;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  completedAt: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string };
}

export interface JobMaterial {
  id: string;
  description: string;
  quantity: string;
  unitCost: string;
  createdAt: string;
}

// Only the single-job fetch (GET /:id) includes materials/invoices and the
// customer's full contact details — the list endpoint only joins
// {id, name}, so this is a separate type rather than widening Job with
// optional fields every list consumer would have to null-check.
export interface JobDetail extends Omit<Job, "customer"> {
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postcode: string | null;
  };
  materials: JobMaterial[];
  invoices: { id: string; invoiceNumber: string; status: InvoiceStatus }[];
}

export function listJobs(token: string) {
  return request<Job[]>("/api/jobs", { method: "GET", token });
}

export function getJob(token: string, id: string) {
  return request<JobDetail>(`/api/jobs/${id}`, { method: "GET", token });
}

export function createJob(token: string, input: CreateJobInput) {
  return request<Job>("/api/jobs", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export function updateJob(token: string, id: string, input: UpdateJobInput) {
  return request<void>(`/api/jobs/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(input),
  });
}

export function updateJobStatus(token: string, id: string, status: JobStatus) {
  return request<void>(`/api/jobs/${id}/status`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ status }),
  });
}

export function addJobMaterial(token: string, jobId: string, input: CreateJobMaterialInput) {
  return request<JobMaterial>(`/api/jobs/${jobId}/materials`, {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export function removeJobMaterial(token: string, jobId: string, materialId: string) {
  return request<void>(`/api/jobs/${jobId}/materials/${materialId}`, {
    method: "DELETE",
    token,
  });
}
