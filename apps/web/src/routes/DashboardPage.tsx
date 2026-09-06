// Matches design/Main.dc.html. Wired to GET /api/dashboard/summary (brief
// §6, §13) now that the jobs and invoices modules it aggregates both
// exist — see apps/api/src/modules/dashboard.
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthToken } from "../auth/context.js";
import { useTerminology } from "../account/context.js";
import { getDashboardSummary, type DashboardSummary } from "../api-client/dashboard.js";
import { PageHeader } from "../components/PageHeader.js";
import { InvoiceStatusBadge } from "../components/StatusBadge.js";
import { CalendarIcon, CheckCircleIcon, PlusIcon, WalletIcon, WarningIcon } from "../components/icons.js";

function formatMoney(amount: string): string {
  return `£${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDue(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function formatCompletedAgo(iso: string | null): string {
  if (!iso) return "recently";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function formatScheduledWhen(iso: string | null): string {
  if (!iso) return "Unscheduled";
  const date = new Date(iso);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const days = Math.floor((date.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  if (days < 7) return `${date.toLocaleDateString(undefined, { weekday: "short" })}, ${time}`;
  return `${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
}

interface StatCardProps {
  label: string;
  value: string;
  sublabel: string;
  icon: ComponentType;
  tone?: "default" | "red" | "green";
  onClick?: () => void;
}

function StatCard({ label, value, sublabel, icon: Icon, tone = "default", onClick }: StatCardProps) {
  const toneColor = tone === "red" ? "var(--red-text)" : tone === "green" ? "var(--green-text)" : undefined;
  return (
    <div
      className="card"
      onClick={onClick}
      style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10, cursor: onClick ? "pointer" : undefined }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: toneColor ?? "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {label}
        </div>
        <span style={{ color: toneColor ?? "var(--text-faint)" }}>
          <Icon />
        </span>
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 28,
          fontVariantNumeric: "tabular-nums",
          color: toneColor,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{sublabel}</div>
    </div>
  );
}

export function DashboardPage() {
  const { getToken } = useAuthToken();
  const navigate = useNavigate();
  const terminology = useTerminology();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      setSummary(await getDashboardSummary(token));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [getToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (error) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Welcome back — here's what's outstanding." />
        <div className="card" style={{ padding: 20, color: "var(--red-text)" }}>{error}</div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Welcome back — here's what's outstanding." />
        <div style={{ padding: 20, color: "var(--text-faint)" }}>Loading…</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Welcome back — here's what's outstanding."
        action={
          <button className="btn-primary" onClick={() => navigate("/jobs")}>
            <PlusIcon />
            New {terminology.job.singular.toLowerCase()}
          </button>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 20, marginBottom: 24 }}>
        <StatCard
          label="Outstanding"
          value={formatMoney(summary.outstanding.total)}
          sublabel={`across ${summary.outstanding.count} invoice${summary.outstanding.count === 1 ? "" : "s"}`}
          icon={WalletIcon}
          onClick={() => navigate("/invoices?filter=OUTSTANDING")}
        />
        <StatCard
          label="Overdue"
          value={formatMoney(summary.overdue.total)}
          sublabel={`${summary.overdue.count} invoice${summary.overdue.count === 1 ? "" : "s"} need${summary.overdue.count === 1 ? "s" : ""} chasing`}
          icon={WarningIcon}
          tone={summary.overdue.count > 0 ? "red" : "default"}
          onClick={() => navigate("/invoices?filter=OVERDUE")}
        />
        <StatCard
          label={`Upcoming ${terminology.job.plural.toLowerCase()}`}
          value={String(summary.upcomingJobsCount)}
          sublabel="in the next 7 days"
          icon={CalendarIcon}
          onClick={() => navigate("/jobs?filter=UPCOMING")}
        />
        <StatCard
          label="Paid this month"
          value={formatMoney(summary.paidThisMonth.total)}
          sublabel={`${summary.paidThisMonth.count} invoice${summary.paidThisMonth.count === 1 ? "" : "s"} settled`}
          icon={CheckCircleIcon}
          tone="green"
          onClick={() => navigate("/invoices?filter=PAID_THIS_MONTH")}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, marginBottom: 24 }}>
        <div className="card" style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15 }}>Needs invoicing</div>
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
              {summary.needsInvoicing.length} completed {terminology.job.plural.toLowerCase()}
            </div>
          </div>
          {summary.needsInvoicing.length === 0 && (
            <div style={{ padding: "12px 0", fontSize: 13, color: "var(--text-faint)" }}>Nothing waiting to be invoiced.</div>
          )}
          {summary.needsInvoicing.map((job) => (
            <div
              key={job.jobId}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 0",
                borderTop: "1px solid var(--border-soft)",
              }}
            >
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{job.title}</div>
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>
                  {job.customerName} · completed {formatCompletedAgo(job.completedAt)}
                </div>
              </div>
              <button
                className="btn-secondary"
                style={{ height: 32, padding: "0 13px", fontSize: 12.5 }}
                onClick={() => navigate(`/jobs/${job.jobId}`)}
              >
                Create invoice
              </button>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: "20px 24px" }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, marginBottom: 14 }}>
            Upcoming {terminology.job.plural.toLowerCase()}
          </div>
          {summary.upcomingJobs.length === 0 && (
            <div style={{ padding: "11px 0", fontSize: 13, color: "var(--text-faint)" }}>Nothing scheduled.</div>
          )}
          {summary.upcomingJobs.map((job) => (
            <div
              key={job.jobId}
              style={{ padding: "11px 0", borderTop: "1px solid var(--border-soft)", cursor: "pointer" }}
              onClick={() => navigate(`/jobs/${job.jobId}`)}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>{job.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{job.customerName}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 4 }}>
                {formatScheduledWhen(job.scheduledStart)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: "20px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15 }}>Recent invoices</div>
          <a
            href="/invoices"
            onClick={(e) => {
              e.preventDefault();
              navigate("/invoices");
            }}
            style={{ fontSize: 12.5, fontWeight: 600 }}
          >
            View all
          </a>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "110px 1.4fr 0.9fr 0.9fr 0.9fr",
            padding: "0 4px 10px 4px",
            borderBottom: "1px solid var(--border)",
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--text-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.03em",
          }}
        >
          <div>Invoice</div>
          <div>Customer</div>
          <div>Amount</div>
          <div>Due</div>
          <div>Status</div>
        </div>

        {summary.recentInvoices.length === 0 && (
          <div style={{ padding: "16px 4px", fontSize: 13, color: "var(--text-faint)" }}>No invoices yet.</div>
        )}

        {summary.recentInvoices.map((invoice, i) => (
          <div
            key={invoice.id}
            style={{
              display: "grid",
              gridTemplateColumns: "110px 1.4fr 0.9fr 0.9fr 0.9fr",
              alignItems: "center",
              padding: "12px 4px",
              borderBottom: i < summary.recentInvoices.length - 1 ? "1px solid var(--border-soft)" : undefined,
              fontSize: 13,
              cursor: "pointer",
            }}
            onClick={() => navigate(`/invoices/${invoice.id}`)}
          >
            <div style={{ fontWeight: 600 }}>{invoice.invoiceNumber}</div>
            <div>{invoice.customerName}</div>
            <div style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(invoice.total)}</div>
            <div style={{ color: "var(--text-muted)" }}>{formatDue(invoice.dueDate)}</div>
            <div>
              <InvoiceStatusBadge status={invoice.status} overdue={invoice.overdue} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
