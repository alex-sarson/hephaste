// List view following the same table pattern as JobsPage, now wired to the
// real invoices module (brief §13, build order item 4). The design canvas
// (design/Invoices.dc.html) mocked the detail screen instead — see
// InvoiceDetailPage, which follows that layout.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { InvoiceStatus } from "@trade-platform/shared-types";
import { useAuthToken } from "../auth/context.js";
import { useTerminology } from "../account/context.js";
import { createInvoice, listInvoices, type Invoice } from "../api-client/invoices.js";
import { listJobs, type Job } from "../api-client/jobs.js";
import { PageHeader } from "../components/PageHeader.js";
import { InvoiceStatusBadge } from "../components/StatusBadge.js";
import { ChevronRightIcon, PlusIcon, SearchIcon } from "../components/icons.js";

// OUTSTANDING and PAID_THIS_MONTH aren't Invoice.status values — they're
// the same combined definitions DashboardPage's stat tiles use (see
// apps/api/src/modules/dashboard/repository.ts's OPEN_INVOICE_STATUSES and
// paidThisMonth window), duplicated here as client-side predicates rather
// than fetched, since this page already has every invoice loaded. Kept in
// sync with the ?filter= query param the dashboard tiles link to.
type InvoiceFilter = InvoiceStatus | "ALL" | "OUTSTANDING" | "OVERDUE" | "PAID_THIS_MONTH";

const FILTERS: Array<{ label: string; status: InvoiceFilter }> = [
  { label: "All", status: "ALL" },
  { label: "Draft", status: "DRAFT" },
  { label: "Sent", status: "SENT" },
  { label: "Viewed", status: "VIEWED" },
  { label: "Outstanding", status: "OUTSTANDING" },
  { label: "Overdue", status: "OVERDUE" },
  { label: "Paid this month", status: "PAID_THIS_MONTH" },
  { label: "Paid", status: "PAID" },
];

const VALID_FILTERS = new Set(FILTERS.map((f) => f.status));

function isPaidThisMonth(invoice: Invoice): boolean {
  if (invoice.status !== "PAID" || !invoice.paidAt) return false;
  const paid = new Date(invoice.paidAt);
  const now = new Date();
  return paid.getFullYear() === now.getFullYear() && paid.getMonth() === now.getMonth();
}

function money(amount: string): string {
  return `£${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDue(invoice: Invoice): string {
  if (!invoice.dueDate) return "—";
  return new Date(invoice.dueDate).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function InvoicesPage() {
  const { getToken } = useAuthToken();
  const terminology = useTerminology();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Seeded from ?filter= (e.g. the dashboard's stat tiles link to
  // /invoices?filter=OUTSTANDING etc.) — falls back to ALL for a bare
  // /invoices visit or an unrecognized value.
  const [filter, setFilter] = useState<InvoiceFilter>(() => {
    const fromUrl = searchParams.get("filter");
    return fromUrl && VALID_FILTERS.has(fromUrl as InvoiceFilter) ? (fromUrl as InvoiceFilter) : "ALL";
  });

  const [showForm, setShowForm] = useState(false);
  const [jobId, setJobId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const [invoicesResult, jobsResult] = await Promise.all([listInvoices(token), listJobs(token)]);
      setInvoices(invoicesResult);
      setJobs(jobsResult.filter((j) => j.status === "COMPLETE"));
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
      const invoice = await createInvoice(token, jobId);
      navigate(`/invoices/${invoice.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  const visible = (invoices ?? []).filter((inv) => {
    if (filter === "ALL") return true;
    if (filter === "OUTSTANDING") return inv.status === "SENT" || inv.status === "VIEWED";
    if (filter === "OVERDUE") return inv.overdue;
    if (filter === "PAID_THIS_MONTH") return isPaidThisMonth(inv);
    return inv.status === filter;
  });

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Every invoice, and where it stands."
        action={
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            <PlusIcon />
            New invoice
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
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              {terminology.job.singular} to invoice
            </label>
            <div className="input">
              <select
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                required
                style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, width: "100%" }}
              >
                <option value="" disabled>
                  {jobs.length === 0
                    ? `No completed ${terminology.job.plural.toLowerCase()} yet`
                    : `Select a completed ${terminology.job.singular.toLowerCase()}…`}
                </option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} — {j.customer.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn-primary" type="submit" disabled={submitting || !jobId}>
            {submitting ? "Creating…" : "Create draft"}
          </button>
        </form>
      )}

      {error && <div style={{ marginBottom: 16, fontSize: 13, color: "var(--red-text)" }}>{error}</div>}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div className="input" style={{ width: 280 }}>
          <SearchIcon style={{ color: "var(--text-faint)" }} />
          <input placeholder={`Search invoices or ${terminology.customer.plural.toLowerCase()}`} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <button
              key={f.status}
              className={`chip${filter === f.status ? " active" : ""}`}
              style={{ border: filter === f.status ? undefined : "1px solid var(--border)" }}
              onClick={() => setFilter(f.status)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: "8px 24px 4px 24px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "110px 1.6fr 0.9fr 0.9fr 0.9fr 32px",
            padding: "12px 4px",
            borderBottom: "1px solid var(--border)",
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--text-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.03em",
          }}
        >
          <div>Invoice</div>
          <div>{terminology.customer.singular}</div>
          <div>Amount</div>
          <div>Due</div>
          <div>Status</div>
          <div />
        </div>

        {invoices === null && !error && (
          <div style={{ padding: "24px 4px", fontSize: 13, color: "var(--text-faint)" }}>Loading…</div>
        )}

        {invoices !== null && visible.length === 0 && (
          <div style={{ padding: "24px 4px", fontSize: 13, color: "var(--text-faint)" }}>
            No invoices match this filter.
          </div>
        )}

        {visible.map((invoice, i) => (
          <div
            key={invoice.id}
            onClick={() => navigate(`/invoices/${invoice.id}`)}
            style={{
              display: "grid",
              gridTemplateColumns: "110px 1.6fr 0.9fr 0.9fr 0.9fr 32px",
              alignItems: "center",
              padding: "13px 4px",
              borderBottom: i < visible.length - 1 ? "1px solid var(--border-soft)" : undefined,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <div style={{ fontWeight: 600 }}>{invoice.invoiceNumber}</div>
            <div>{invoice.customer.name}</div>
            <div style={{ fontVariantNumeric: "tabular-nums" }}>{money(invoice.total)}</div>
            <div style={{ color: "var(--text-muted)" }}>{formatDue(invoice)}</div>
            <div>
              <InvoiceStatusBadge status={invoice.status} overdue={invoice.overdue} />
            </div>
            <div style={{ color: "var(--text-faint)" }}>
              <ChevronRightIcon />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
