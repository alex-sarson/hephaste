// Matches design/Jobs.dc.html, now wired to the real jobs module (brief
// §13, build order item 3) the same way CustomersPage is wired to
// customers — see apps/api/src/modules/jobs.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { JobStatus } from "@trade-platform/shared-types";
import { useAuthToken } from "../auth/context.js";
import { useTerminology } from "../account/context.js";
import { createJob, listJobs, type Job } from "../api-client/jobs.js";
import { listCustomers, type Customer } from "../api-client/customers.js";
import { PageHeader } from "../components/PageHeader.js";
import { JobStatusBadge } from "../components/StatusBadge.js";
import { ChevronRightIcon, PlusIcon, SearchIcon } from "../components/icons.js";

const FILTERS: Array<{ label: string; status: JobStatus | "ALL" }> = [
  { label: "All", status: "ALL" },
  { label: "Quoted", status: "QUOTED" },
  { label: "Scheduled", status: "SCHEDULED" },
  { label: "In progress", status: "IN_PROGRESS" },
  { label: "Complete", status: "COMPLETE" },
  { label: "Cancelled", status: "CANCELLED" },
];

function formatScheduled(job: Job): string {
  if (!job.scheduledStart) return "—";
  return new Date(job.scheduledStart).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function formatAddress(job: Job): string {
  return [job.addressLine1, job.city, job.postcode].filter(Boolean).join(", ") || "—";
}

export function JobsPage() {
  const { getToken } = useAuthToken();
  const navigate = useNavigate();
  const terminology = useTerminology();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<JobStatus | "ALL">("ALL");

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const [jobsResult, customersResult] = await Promise.all([listJobs(token), listCustomers(token)]);
      setJobs(jobsResult);
      setCustomers(customersResult);
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
      await createJob(token, { customerId, title });
      setTitle("");
      setCustomerId("");
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const visibleJobs = (jobs ?? []).filter((j) => filter === "ALL" || j.status === filter);

  return (
    <div>
      <PageHeader
        title={terminology.job.plural}
        subtitle={`Track every ${terminology.job.singular.toLowerCase()} from start to invoice.`}
        action={
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            <PlusIcon />
            New {terminology.job.singular.toLowerCase()}
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
              {terminology.customer.singular}
            </label>
            <div className="input">
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
                style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, width: "100%" }}
              >
                <option value="" disabled>
                  Select a {terminology.customer.singular.toLowerCase()}…
                </option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 2 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Title</label>
            <div className="input">
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
          </div>
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Adding…" : `Add ${terminology.job.singular.toLowerCase()}`}
          </button>
        </form>
      )}

      {error && <div style={{ marginBottom: 16, fontSize: 13, color: "var(--red-text)" }}>{error}</div>}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div className="input" style={{ width: 280 }}>
          <SearchIcon style={{ color: "var(--text-faint)" }} />
          <input placeholder={`Search ${terminology.job.plural.toLowerCase()} or ${terminology.customer.plural.toLowerCase()}`} />
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
            gridTemplateColumns: "2fr 1fr 1fr 1.3fr 32px",
            padding: "12px 4px",
            borderBottom: "1px solid var(--border)",
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--text-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.03em",
          }}
        >
          <div>{terminology.job.singular}</div>
          <div>Status</div>
          <div>Scheduled</div>
          <div>Site address</div>
          <div />
        </div>

        {jobs === null && !error && (
          <div style={{ padding: "24px 4px", fontSize: 13, color: "var(--text-faint)" }}>Loading…</div>
        )}

        {jobs !== null && visibleJobs.length === 0 && (
          <div style={{ padding: "24px 4px", fontSize: 13, color: "var(--text-faint)" }}>
            No {terminology.job.plural.toLowerCase()} match this filter.
          </div>
        )}

        {visibleJobs.map((job, i) => (
          <div
            key={job.id}
            onClick={() => navigate(`/jobs/${job.id}`)}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1.3fr 32px",
              alignItems: "center",
              padding: "13px 4px",
              borderBottom: i < visibleJobs.length - 1 ? "1px solid var(--border-soft)" : undefined,
              opacity: job.status === "CANCELLED" ? 0.7 : undefined,
              cursor: "pointer",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    textDecoration: job.status === "CANCELLED" ? "line-through" : undefined,
                    color: job.status === "CANCELLED" ? "var(--text-faint)" : undefined,
                  }}
                >
                  {job.title}
                </div>
                {/* Approximation until the invoices module exists to check
                    whether one has actually been created for this job. */}
                {job.status === "COMPLETE" && (
                  <span className="pill" style={{ background: "var(--accent-soft)", color: "var(--accent-soft-text)", padding: "1px 7px", fontSize: 10.5 }}>
                    Needs invoice
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{job.customer.name}</div>
            </div>
            <div>
              <JobStatusBadge status={job.status} />
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{formatScheduled(job)}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{formatAddress(job)}</div>
            <div style={{ color: "var(--text-faint)" }}>
              <ChevronRightIcon />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
