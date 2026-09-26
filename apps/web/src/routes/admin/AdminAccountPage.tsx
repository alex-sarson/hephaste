// Admin console → one account's support summary. Metadata and states only.
// Opening this page is recorded in the audit log by the API (so is a
// resend), and the page says so — the "admins can't quietly browse tenant
// data" guarantee is only credible if the people using it can see it too.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { InvoiceStatus, JobStatus } from "@hephaste/shared-types";
import { useAuthToken } from "../../auth/context.js";
import {
  getAdminAccountSummary,
  resendInvoiceEmailAsAdmin,
  type AdminAccountSummary,
  type AdminInvoiceRow,
} from "../../api-client/admin.js";
import { PageHeader } from "../../components/PageHeader.js";
import {
  InvoiceStatusBadge,
  JobStatusBadge,
} from "../../components/StatusBadge.js";

const JOB_ORDER: JobStatus[] = [
  "QUOTED",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETE",
  "CANCELLED",
];
const INVOICE_ORDER: InvoiceStatus[] = [
  "DRAFT",
  "SENT",
  "VIEWED",
  "PAID",
  "VOID",
];

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div className="card" style={{ padding: "16px 20px" }}>
      <div
        style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 26,
          marginTop: 4,
          color: warn && value > 0 ? "var(--red-text)" : "var(--text)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Breakdown<T extends string>({
  title,
  order,
  counts,
  badge,
}: {
  title: string;
  order: T[];
  counts: Partial<Record<T, number>>;
  badge: (status: T) => React.ReactNode;
}) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 15,
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {order.map((status) => (
          <div
            key={status}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 13,
            }}
          >
            {badge(status)}
            <span
              style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}
            >
              {counts[status] ?? 0}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmailCell({ invoice }: { invoice: AdminInvoiceRow }) {
  if (!invoice.email)
    return <span style={{ color: "var(--text-faint)" }}>Not sent</span>;
  if (invoice.email.status === "FAILED") {
    return (
      <span
        style={{ color: "var(--red-text)" }}
        title={invoice.email.lastError ?? undefined}
      >
        Failed{invoice.email.lastError ? ` — ${invoice.email.lastError}` : ""}
      </span>
    );
  }
  return (
    <span style={{ color: "var(--text-muted)" }}>
      {invoice.email.status === "SENT" ? "Delivered to provider" : "Sending…"}
    </span>
  );
}

export function AdminAccountPage() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuthToken();
  const [summary, setSummary] = useState<AdminAccountSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);

  // Fetching this summary is an audited action (the API writes one
  // "viewed" row per request), so it must happen exactly once per visit.
  // An effect alone can't promise that: React StrictMode runs every effect
  // twice in development, and a changed `getToken` identity would re-run it
  // too — each run being a second audit row for one look at the page. The
  // ref remembers which account has already been requested; results are
  // applied regardless of effect cleanup, since the one request that does go
  // out belongs to this page for as long as it shows this account.
  const requestedFor = useRef<string | null>(null);
  useEffect(() => {
    if (requestedFor.current === id) return;
    requestedFor.current = id!;
    (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Not signed in");
        const result = await getAdminAccountSummary(token, id!);
        if (requestedFor.current === id) setSummary(result);
      } catch (err) {
        if (requestedFor.current === id) setError((err as Error).message);
      }
    })();
  }, [getToken, id]);

  const resend = useCallback(
    async (invoiceId: string) => {
      setResending(invoiceId);
      setError(null);
      try {
        const token = await getToken();
        if (!token) throw new Error("Not signed in");
        await resendInvoiceEmailAsAdmin(token, invoiceId);
        // Reflect the queued retry locally rather than re-fetching, which
        // would log a second "summary viewed" entry for the same visit.
        setSummary((prev) =>
          prev
            ? {
                ...prev,
                recentInvoices: prev.recentInvoices.map((i) =>
                  i.id === invoiceId
                    ? {
                        ...i,
                        email: {
                          status: "SENDING",
                          lastError: null,
                          updatedAt: new Date().toISOString(),
                        },
                      }
                    : i,
                ),
              }
            : prev,
        );
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setResending(null);
      }
    },
    [getToken],
  );

  if (error && !summary) {
    return (
      <div>
        <Link to="/admin" style={{ fontSize: 13 }}>
          ← Accounts
        </Link>
        <div style={{ marginTop: 16, fontSize: 13, color: "var(--red-text)" }}>
          {error}
        </div>
      </div>
    );
  }
  if (!summary)
    return (
      <div style={{ fontSize: 13, color: "var(--text-faint)" }}>Loading…</div>
    );

  const { account } = summary;
  const invoiceTotal = Object.values(summary.invoicesByStatus).reduce(
    (a, b) => a + (b ?? 0),
    0,
  );
  const jobTotal = Object.values(summary.jobsByStatus).reduce(
    (a, b) => a + (b ?? 0),
    0,
  );

  return (
    <div>
      <Link to="/admin" style={{ fontSize: 13 }}>
        ← Accounts
      </Link>
      <div style={{ height: 12 }} />
      <PageHeader
        title={account.businessName}
        subtitle={`${account.contactEmail} · ${account.industry.charAt(0) + account.industry.slice(1).toLowerCase()} · ${account.currency} · joined ${new Date(account.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}${account.deletedAt ? " · deleted" : ""}`}
      />

      <div
        style={{
          fontSize: 12.5,
          color: "var(--accent-soft-text)",
          background: "var(--accent-soft)",
          borderRadius: "var(--radius-md)",
          padding: "10px 14px",
          marginBottom: 20,
        }}
      >
        Viewing this page is recorded in the audit log. You can see counts and
        states here, never this account's customers, jobs or amounts.
      </div>

      {error && (
        <div
          style={{ marginBottom: 16, fontSize: 13, color: "var(--red-text)" }}
        >
          {error}
        </div>
      )}

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <Stat label="Customers" value={summary.customerCount} />
        <Stat label="Jobs" value={jobTotal} />
        <Stat label="Invoices" value={invoiceTotal} />
        <Stat label="Overdue invoices" value={summary.overdueCount} warn />
      </div>

      <div
        className="two-col-layout"
        style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 20 }}
      >
        <Breakdown
          title="Jobs by status"
          order={JOB_ORDER}
          counts={summary.jobsByStatus}
          badge={(s) => <JobStatusBadge status={s} />}
        />
        <Breakdown
          title="Invoices by status"
          order={INVOICE_ORDER}
          counts={summary.invoicesByStatus}
          badge={(s) => <InvoiceStatusBadge status={s} />}
        />
      </div>

      <div className="card" style={{ padding: "16px 24px 8px 24px" }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 15,
          }}
        >
          Recent invoices
        </div>
        <div
          style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}
        >
          Number, state and email delivery only. Retry is offered when the last
          email attempt failed.
        </div>
        <div className="table-scroll" style={{ marginTop: 8 }}>
          {summary.recentInvoices.length === 0 && (
            <div
              style={{
                padding: "16px 0",
                fontSize: 13,
                color: "var(--text-faint)",
              }}
            >
              No invoices yet.
            </div>
          )}
          {summary.recentInvoices.map((inv, i) => (
            <div
              key={inv.id}
              style={{
                display: "grid",
                gridTemplateColumns: "120px 110px minmax(180px, 1fr) 110px",
                minWidth: 620,
                alignItems: "center",
                gap: 8,
                padding: "12px 0",
                borderTop:
                  i === 0
                    ? "1px solid var(--border)"
                    : "1px solid var(--border-soft)",
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 600 }}>{inv.invoiceNumber}</div>
              <div>
                <InvoiceStatusBadge status={inv.status} overdue={inv.overdue} />
              </div>
              <div style={{ minWidth: 0 }}>
                <EmailCell invoice={inv} />
              </div>
              <div style={{ textAlign: "right" }}>
                {inv.email?.status === "FAILED" && (
                  <button
                    className="btn-secondary"
                    style={{ height: 32 }}
                    disabled={resending === inv.id}
                    onClick={() => resend(inv.id)}
                  >
                    {resending === inv.id ? "Queuing…" : "Retry email"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
