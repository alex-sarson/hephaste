// Status is always a dot + label pill (never a left-border stripe) — see
// design/Styleguide.dc.html. Typed against the same enums the API and DB
// use (@trade-platform/shared-types) so the UI can never drift into a
// status the backend doesn't have.
import type { CSSProperties } from "react";
import type { InvoiceStatus, JobStatus } from "@trade-platform/shared-types";

interface PillSpec {
  label: string;
  background: string;
  color: string;
  dimmed?: boolean;
}

const INVOICE_STATUS_PILLS: Record<InvoiceStatus, PillSpec> = {
  DRAFT: { label: "Draft", background: "var(--gray-bg)", color: "var(--gray-text)" },
  SENT: { label: "Sent", background: "var(--blue-bg)", color: "var(--blue-text)" },
  VIEWED: { label: "Viewed", background: "var(--teal-bg)", color: "var(--teal-text)" },
  PAID: { label: "Paid", background: "var(--green-bg)", color: "var(--green-text)" },
  VOID: { label: "Void", background: "var(--gray-bg)", color: "var(--gray-text)", dimmed: true },
};

const JOB_STATUS_PILLS: Record<JobStatus, PillSpec> = {
  QUOTED: { label: "Quoted", background: "var(--gray-bg)", color: "var(--gray-text)" },
  SCHEDULED: { label: "Scheduled", background: "var(--blue-bg)", color: "var(--blue-text)" },
  IN_PROGRESS: { label: "In progress", background: "var(--accent-soft)", color: "var(--accent-soft-text)" },
  COMPLETE: { label: "Complete", background: "var(--green-bg)", color: "var(--green-text)" },
  CANCELLED: { label: "Cancelled", background: "var(--gray-bg)", color: "var(--gray-text)", dimmed: true },
};

// A derived "overdue" flag (brief §4) takes precedence over the base status
// pill wherever both would otherwise show — overdue is the more actionable
// signal for the tradesperson.
const OVERDUE_PILL: PillSpec = { label: "Overdue", background: "var(--red-bg)", color: "var(--red-text)" };

function Pill({ spec }: { spec: PillSpec }) {
  const style: CSSProperties = {
    background: spec.background,
    color: spec.color,
    opacity: spec.dimmed ? 0.75 : undefined,
  };
  return (
    <span className="pill" style={style}>
      <span className="dot" />
      {spec.label}
    </span>
  );
}

export function InvoiceStatusBadge({ status, overdue }: { status: InvoiceStatus; overdue?: boolean }) {
  return <Pill spec={overdue ? OVERDUE_PILL : INVOICE_STATUS_PILLS[status]} />;
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Pill spec={JOB_STATUS_PILLS[status]} />;
}
