// Matches design/Jobs.dc.html. Sample data — Phase 1 (brief §13) wires this
// to GET /api/jobs once the jobs module exists (see
// apps/api/src/modules/jobs, currently a stub). Status filter chips are
// visual only until then.
import { useState } from "react";
import type { JobStatus } from "@trade-platform/shared-types";
import { useTerminology } from "../account/context.js";
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

interface JobRow {
  title: string;
  customer: string;
  status: JobStatus;
  scheduled: string;
  address: string;
  needsInvoice?: boolean;
}

const JOBS: JobRow[] = [
  { title: "Kitchen extension wiring", customer: "Aldridge Construction", status: "IN_PROGRESS", scheduled: "Tomorrow", address: "14 Elm Grove, Bristol" },
  { title: "Annual gas safety check", customer: "Priya Nandan", status: "SCHEDULED", scheduled: "Wed, 10:00am", address: "9 Cathedral Close" },
  { title: "Rewire upstairs sockets", customer: "Jane Whitfield", status: "COMPLETE", scheduled: "2 days ago", address: "22 Vale Road", needsInvoice: true },
  { title: "Boiler service & flush", customer: "Riverside Cafe", status: "COMPLETE", scheduled: "3 days ago", address: "1 Riverside Walk" },
  { title: "Consumer unit quote", customer: "Marcus Ellery", status: "QUOTED", scheduled: "—", address: "6 Orchard Close" },
  { title: "Outdoor lighting install", customer: "Tom Bracewell", status: "CANCELLED", scheduled: "—", address: "3 Harbour Lane" },
];

export function JobsPage() {
  const terminology = useTerminology();
  const [filter, setFilter] = useState<JobStatus | "ALL">("ALL");
  const visibleJobs = filter === "ALL" ? JOBS : JOBS.filter((j) => j.status === filter);

  return (
    <div>
      <PageHeader
        title={terminology.job.plural}
        subtitle={`Track every ${terminology.job.singular.toLowerCase()} from start to invoice.`}
        action={
          <button className="btn-primary">
            <PlusIcon />
            New {terminology.job.singular.toLowerCase()}
          </button>
        }
      />

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

        {visibleJobs.length === 0 && (
          <div style={{ padding: "24px 4px", fontSize: 13, color: "var(--text-faint)" }}>
            No {terminology.job.plural.toLowerCase()} match this filter.
          </div>
        )}

        {visibleJobs.map((job, i) => (
          <div
            key={job.title}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1.3fr 32px",
              alignItems: "center",
              padding: "13px 4px",
              borderBottom: i < visibleJobs.length - 1 ? "1px solid var(--border-soft)" : undefined,
              opacity: job.status === "CANCELLED" ? 0.7 : undefined,
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
                {job.needsInvoice && (
                  <span className="pill" style={{ background: "var(--accent-soft)", color: "var(--accent-soft-text)", padding: "1px 7px", fontSize: 10.5 }}>
                    Needs invoice
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{job.customer}</div>
            </div>
            <div>
              <JobStatusBadge status={job.status} />
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{job.scheduled}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{job.address}</div>
            <div style={{ color: "var(--text-faint)" }}>
              <ChevronRightIcon />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
