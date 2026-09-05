// Matches design/Main.dc.html. Stat cards, "needs invoicing" and "upcoming
// jobs" lists, and the recent-invoices table are sample data — Phase 1
// (brief §6, §13) wires this to GET /api/dashboard/summary once the jobs
// and invoices modules exist. Customers is the only module with real data
// today (see CustomersPage).
import type { ComponentType } from "react";
import { useTerminology } from "../account/context.js";
import { PageHeader } from "../components/PageHeader.js";
import { InvoiceStatusBadge } from "../components/StatusBadge.js";
import { CalendarIcon, CheckCircleIcon, PlusIcon, WalletIcon, WarningIcon } from "../components/icons.js";
import type { InvoiceStatus } from "@trade-platform/shared-types";

interface StatCardProps {
  label: string;
  value: string;
  sublabel: string;
  icon: ComponentType;
  tone?: "default" | "red" | "green";
}

function StatCard({ label, value, sublabel, icon: Icon, tone = "default" }: StatCardProps) {
  const toneColor = tone === "red" ? "var(--red-text)" : tone === "green" ? "var(--green-text)" : undefined;
  return (
    <div className="card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
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

const NEEDS_INVOICING = [
  { title: "Rewire upstairs sockets", customer: "Jane Whitfield", completedAgo: "2 days ago" },
  { title: "Boiler service & flush", customer: "Riverside Cafe", completedAgo: "3 days ago" },
  { title: "Garden tap installation", customer: "Marcus Ellery", completedAgo: "5 days ago" },
];

const UPCOMING_JOBS = [
  { title: "Kitchen extension wiring", customer: "Aldridge Construction", when: "Tomorrow, 8:30am" },
  { title: "Annual gas safety check", customer: "Priya Nandan", when: "Wed, 10:00am" },
  { title: "Fuse board replacement", customer: "Riverside Cafe", when: "Thu, 9:00am" },
];

const RECENT_INVOICES: Array<{
  number: string;
  customer: string;
  amount: string;
  due: string;
  status: InvoiceStatus;
  overdue?: boolean;
}> = [
  { number: "INV-0043", customer: "Aldridge Construction", amount: "£1,240.00", due: "12 Sep", status: "SENT", overdue: true },
  { number: "INV-0042", customer: "Jane Whitfield", amount: "£340.00", due: "18 Sep", status: "VIEWED" },
  { number: "INV-0041", customer: "Riverside Cafe", amount: "£615.00", due: "15 Sep", status: "SENT" },
  { number: "INV-0040", customer: "Priya Nandan", amount: "£890.00", due: "9 Sep", status: "PAID" },
  { number: "INV-0039", customer: "Marcus Ellery", amount: "£212.00", due: "2 Sep", status: "PAID" },
];

export function DashboardPage() {
  const terminology = useTerminology();
  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Welcome back — here's what's outstanding."
        action={
          <button className="btn-primary">
            <PlusIcon />
            New {terminology.job.singular.toLowerCase()}
          </button>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 20, marginBottom: 24 }}>
        <StatCard label="Outstanding" value="£4,286.50" sublabel="across 6 invoices" icon={WalletIcon} />
        <StatCard label="Overdue" value="£980.00" sublabel="2 invoices need chasing" icon={WarningIcon} tone="red" />
        <StatCard label={`Upcoming ${terminology.job.plural.toLowerCase()}`} value="5" sublabel="in the next 7 days" icon={CalendarIcon} />
        <StatCard label="Paid this month" value="£3,120.00" sublabel="9 invoices settled" icon={CheckCircleIcon} tone="green" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, marginBottom: 24 }}>
        <div className="card" style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15 }}>Needs invoicing</div>
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
              {NEEDS_INVOICING.length} completed {terminology.job.plural.toLowerCase()}
            </div>
          </div>
          {NEEDS_INVOICING.map((job) => (
            <div
              key={job.title}
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
                  {job.customer} · completed {job.completedAgo}
                </div>
              </div>
              <button className="btn-secondary" style={{ height: 32, padding: "0 13px", fontSize: 12.5 }}>
                Create invoice
              </button>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: "20px 24px" }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, marginBottom: 14 }}>
            Upcoming {terminology.job.plural.toLowerCase()}
          </div>
          {UPCOMING_JOBS.map((job) => (
            <div key={job.title} style={{ padding: "11px 0", borderTop: "1px solid var(--border-soft)" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{job.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{job.customer}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 4 }}>{job.when}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: "20px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15 }}>Recent invoices</div>
          <a href="#" style={{ fontSize: 12.5, fontWeight: 600 }}>
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

        {RECENT_INVOICES.map((invoice, i) => (
          <div
            key={invoice.number}
            style={{
              display: "grid",
              gridTemplateColumns: "110px 1.4fr 0.9fr 0.9fr 0.9fr",
              alignItems: "center",
              padding: "12px 4px",
              borderBottom: i < RECENT_INVOICES.length - 1 ? "1px solid var(--border-soft)" : undefined,
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 600 }}>{invoice.number}</div>
            <div>{invoice.customer}</div>
            <div style={{ fontVariantNumeric: "tabular-nums" }}>{invoice.amount}</div>
            <div style={{ color: "var(--text-muted)" }}>{invoice.due}</div>
            <div>
              <InvoiceStatusBadge status={invoice.status} overdue={invoice.overdue} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
