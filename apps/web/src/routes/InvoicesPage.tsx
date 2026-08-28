// A list view following the same table pattern as JobsPage — the design
// canvas (design/Invoices.dc.html) mocked the invoice DETAIL screen
// (line items, status timeline, email activity) rather than a list; that
// detail layout is the reference for Phase 1 when GET /api/invoices/:id
// and per-invoice routing exist (brief §13). Sample data until then.
import { useState } from "react";
import type { InvoiceStatus } from "@trade-platform/shared-types";
import { PageHeader } from "../components/PageHeader.js";
import { InvoiceStatusBadge } from "../components/StatusBadge.js";
import { ChevronRightIcon, SearchIcon } from "../components/icons.js";

const FILTERS: Array<{ label: string; status: InvoiceStatus | "ALL" | "OVERDUE" }> = [
  { label: "All", status: "ALL" },
  { label: "Draft", status: "DRAFT" },
  { label: "Sent", status: "SENT" },
  { label: "Viewed", status: "VIEWED" },
  { label: "Overdue", status: "OVERDUE" },
  { label: "Paid", status: "PAID" },
];

interface InvoiceRow {
  number: string;
  customer: string;
  amount: string;
  due: string;
  status: InvoiceStatus;
  overdue?: boolean;
}

const INVOICES: InvoiceRow[] = [
  { number: "INV-0043", customer: "Aldridge Construction", amount: "£1,240.00", due: "12 Sep", status: "SENT", overdue: true },
  { number: "INV-0042", customer: "Jane Whitfield", amount: "£340.00", due: "18 Sep", status: "VIEWED" },
  { number: "INV-0041", customer: "Riverside Cafe", amount: "£615.00", due: "15 Sep", status: "SENT" },
  { number: "INV-0040", customer: "Priya Nandan", amount: "£890.00", due: "9 Sep", status: "PAID" },
  { number: "INV-0039", customer: "Marcus Ellery", amount: "£212.00", due: "2 Sep", status: "PAID" },
  { number: "INV-0038", customer: "Tom Bracewell", amount: "£150.00", due: "—", status: "DRAFT" },
];

export function InvoicesPage() {
  const [filter, setFilter] = useState<InvoiceStatus | "ALL" | "OVERDUE">("ALL");
  const visible = INVOICES.filter((inv) => {
    if (filter === "ALL") return true;
    if (filter === "OVERDUE") return !!inv.overdue;
    return inv.status === filter;
  });

  return (
    <div>
      <PageHeader title="Invoices" subtitle="Every invoice, and where it stands." />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div className="input" style={{ width: 280 }}>
          <SearchIcon style={{ color: "var(--text-faint)" }} />
          <input placeholder="Search invoices or customers" />
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
          <div>Customer</div>
          <div>Amount</div>
          <div>Due</div>
          <div>Status</div>
          <div />
        </div>

        {visible.length === 0 && (
          <div style={{ padding: "24px 4px", fontSize: 13, color: "var(--text-faint)" }}>
            No invoices match this filter.
          </div>
        )}

        {visible.map((invoice, i) => (
          <div
            key={invoice.number}
            style={{
              display: "grid",
              gridTemplateColumns: "110px 1.6fr 0.9fr 0.9fr 0.9fr 32px",
              alignItems: "center",
              padding: "13px 4px",
              borderBottom: i < visible.length - 1 ? "1px solid var(--border-soft)" : undefined,
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
            <div style={{ color: "var(--text-faint)" }}>
              <ChevronRightIcon />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
