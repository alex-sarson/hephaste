import type { CreateCustomerInput } from "@trade-platform/shared-types";
import { request } from "./client.js";

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

export function listCustomers(token: string) {
  return request<Customer[]>("/api/customers", { method: "GET", token });
}

export function createCustomer(token: string, input: CreateCustomerInput) {
  return request<Customer>("/api/customers", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}
