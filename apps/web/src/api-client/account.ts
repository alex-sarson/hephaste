import type { OnboardingRequestInput } from "@trade-platform/shared-types";
import { request } from "./client.js";

export interface Account {
  id: string;
  businessName: string;
  contactEmail: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  industry: string;
  jobLabelSingular: string | null;
  jobLabelPlural: string | null;
  customerLabelSingular: string | null;
  customerLabelPlural: string | null;
  assetLabelSingular: string | null;
  assetLabelPlural: string | null;
  onboardingCompletedAt: string | null;
}

export function getAccount(token: string) {
  return request<Account>("/api/account/me", { method: "GET", token });
}

export function updateTerminology(token: string, input: OnboardingRequestInput) {
  return request<Account>("/api/account/me/terminology", {
    method: "PATCH",
    token,
    body: JSON.stringify(input),
  });
}
