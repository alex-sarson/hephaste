import type {
  CreateJobInput,
  CreateJobMaterialInput,
  InvoiceStatus,
  JobLocationType,
  JobStatus,
  UpdateJobInput,
} from "@hephaste/shared-types";
import { API_BASE_URL, request } from "./client.js";

export interface Job {
  id: string;
  title: string;
  description: string | null;
  status: JobStatus;
  locationType: JobLocationType;
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

export interface Attachment {
  id: string;
  originalFilename: string;
  fileType: string;
  fileSizeBytes: number;
  uploadedAt: string;
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
  attachments: Attachment[];
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

// Doesn't go through request() — that helper always sends
// Content-Type: application/json and JSON.stringifies the body, which
// would break a multipart upload (the browser needs to set its own
// Content-Type with the multipart boundary, computed from the FormData).
export async function uploadJobAttachment(token: string, jobId: string, file: File): Promise<Attachment> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<Attachment>;
}

// Attachments are stored privately, so viewing/downloading one is a
// two-step fetch: get a short-lived signed URL from the API, then let the
// browser navigate to it directly (the API server itself never proxies the
// file bytes).
export function getJobAttachmentUrl(token: string, jobId: string, attachmentId: string) {
  return request<{ url: string }>(`/api/jobs/${jobId}/attachments/${attachmentId}/url`, {
    method: "GET",
    token,
  });
}

export function removeJobAttachment(token: string, jobId: string, attachmentId: string) {
  return request<void>(`/api/jobs/${jobId}/attachments/${attachmentId}`, {
    method: "DELETE",
    token,
  });
}
