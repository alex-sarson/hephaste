// The invoice status transition rules — see brief §4. `Invoice.status` must
// only ever change through `assertValidTransition` (or a caller that has
// already checked it); every accepted transition must be paired with an
// InvoiceStatusEvent row written in the same DB transaction.
import type { InvoiceStatus, TriggerSource } from "@hephaste/shared-types";

const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ["SENT", "VOID"],
  SENT: ["VIEWED", "PAID", "VOID"],
  VIEWED: ["PAID", "VOID"],
  PAID: [], // terminal in v1 — see brief §4.3 on disallowing un-paying via this path
  VOID: [], // terminal
};

// Which trigger sources are permitted to cause which transitions. Keeps a
// webhook, say, from being able to mark something PAID.
const ALLOWED_TRIGGERS: Record<InvoiceStatus, TriggerSource[]> = {
  DRAFT: [],
  SENT: ["MANUAL_USER"],
  VIEWED: ["EMAIL_WEBHOOK"],
  PAID: ["MANUAL_USER", "ADMIN"],
  VOID: ["MANUAL_USER", "ADMIN"],
};

export class InvalidInvoiceTransitionError extends Error {
  constructor(from: InvoiceStatus, to: InvoiceStatus) {
    super(`Cannot transition invoice from ${from} to ${to}`);
    this.name = "InvalidInvoiceTransitionError";
  }
}

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Throws if the transition isn't a legal state-machine edge, or isn't
 * permitted for the given trigger source. Call this before writing
 * Invoice.status + InvoiceStatusEvent.
 */
export function assertValidTransition(
  from: InvoiceStatus,
  to: InvoiceStatus,
  triggeredBy: TriggerSource,
): void {
  if (!canTransition(from, to)) {
    throw new InvalidInvoiceTransitionError(from, to);
  }
  if (!ALLOWED_TRIGGERS[to].includes(triggeredBy)) {
    throw new InvalidInvoiceTransitionError(from, to);
  }
}
