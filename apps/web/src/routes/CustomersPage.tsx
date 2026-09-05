// Matches design/Customers.dc.html. The one real vertical slice wired
// end-to-end: fetches from and posts to the customers module in
// apps/api/src/modules/customers (the reference tenant-scoped repository
// implementation — see brief §7.2).
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuthToken } from "../auth/context.js";
import { useTerminology } from "../account/context.js";
import { createCustomer, listCustomers, type Customer } from "../api-client/customers.js";
import { PageHeader } from "../components/PageHeader.js";
import { PlusIcon, SearchIcon } from "../components/icons.js";

// Cycles through the same status-color family used for badges, so avatar
// chips read as "part of the system" without adding new tokens.
const AVATAR_PALETTE = [
  { background: "var(--accent-soft)", color: "var(--accent-soft-text)" },
  { background: "var(--blue-bg)", color: "var(--blue-text)" },
  { background: "var(--green-bg)", color: "var(--green-text)" },
  { background: "var(--teal-bg)", color: "var(--teal-text)" },
  { background: "var(--gray-bg)", color: "var(--gray-text)" },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function paletteFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length] ?? AVATAR_PALETTE[0]!;
}

export function CustomersPage() {
  const { getToken } = useAuthToken();
  const terminology = useTerminology();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      setCustomers(await listCustomers(token));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [getToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      await createCustomer(token, { name, email: email || undefined });
      setName("");
      setEmail("");
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={terminology.customer.plural}
        subtitle="Everyone you've worked with, and what's outstanding."
        action={
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            <PlusIcon />
            New {terminology.customer.singular.toLowerCase()}
          </button>
        }
      />

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="card"
          style={{ padding: 20, display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 20 }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Name</label>
            <div className="input">
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Email (optional)</label>
            <div className="input">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Adding…" : `Add ${terminology.customer.singular.toLowerCase()}`}
          </button>
        </form>
      )}

      {error && (
        <div style={{ marginBottom: 16, fontSize: 13, color: "var(--red-text)" }}>{error}</div>
      )}

      <div className="input" style={{ width: 320, marginBottom: 20 }}>
        <SearchIcon style={{ color: "var(--text-faint)" }} />
        <input placeholder={`Search ${terminology.customer.plural.toLowerCase()}`} />
      </div>

      <div className="card" style={{ padding: "6px 24px" }}>
        {customers === null && !error && (
          <div style={{ padding: "24px 4px", fontSize: 13, color: "var(--text-faint)" }}>Loading…</div>
        )}
        {customers?.length === 0 && (
          <div style={{ padding: "24px 4px", fontSize: 13, color: "var(--text-faint)" }}>
            No {terminology.customer.plural.toLowerCase()} yet — add one above.
          </div>
        )}
        {customers?.map((customer, i) => {
          const palette = paletteFor(customer.id);
          return (
            <div
              key={customer.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 0",
                borderBottom: i < customers.length - 1 ? "1px solid var(--border-soft)" : undefined,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div className="avatar" style={{ background: palette.background, color: palette.color }}>
                  {initials(customer.name) || "?"}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{customer.name}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>
                    {[customer.email, customer.phone].filter(Boolean).join(" · ") || "No contact details"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
