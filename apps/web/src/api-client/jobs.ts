import type { CreateJobInput, JobStatus } from "@trade-platform/shared-types";
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

export function listJobs(token: string) {
  return request<Job[]>("/api/jobs", { method: "GET", token });
}

export function createJob(token: string, input: CreateJobInput) {
  return request<Job>("/api/jobs", {
    method: "POST",
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
