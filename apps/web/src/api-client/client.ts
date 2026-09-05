// Thin typed fetch wrapper. Each module (customers, jobs, invoices) gets its
// own small file here that calls `request` and types the response using the
// corresponding schema from @trade-platform/shared-types — never `any`.
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export async function request<T>(
  path: string,
  options: RequestInit & { token: string },
): Promise<T> {
  const { token, ...rest } = options;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...rest.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
