// Matches design/Invoices.dc.html's invoice detail mockup (line items,
// totals, status timeline). Line items/due date/notes are editable while
// DRAFT (brief §4 — locked once sent); email activity is a later
// checkpoint (Resend) and is left out rather than shown as a dead panel.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { calculateInvoiceTotals } from "@trade-platform/invoice-engine";
import type { EmailSendStatus, InvoiceLineItemInput, InvoiceStatus, LineItemType } from "@trade-platform/shared-types";
import { useAuthToken } from "../auth/context.js";
import { useAccount } from "../account/context.js";
import {
  getInvoice,
  getInvoicePdfUrl,
  markInvoicePaid,
  resendInvoiceEmail,
  sendInvoice,
  updateInvoice,
  voidInvoice,
  type Invoice,
  type InvoiceDetail,
} from "../api-client/invoices.js";
import { InvoiceStatusBadge } from "../components/StatusBadge.js";
import { DownloadIcon, PlusIcon } from "../components/icons.js";

const LINE_ITEM_TYPES: LineItemType[] = ["LABOUR", "MATERIALS", "OTHER"];
const TYPE_LABEL: Record<LineItemType, string> = { LABOUR: "Labour", MATERIALS: "Materials", OTHER: "Other" };

const STATUS_EVENT: Record<InvoiceStatus, { label: string; background: string; color: string }> = {
  DRAFT: { label: "Draft created", background: "var(--gray-bg)", color: "var(--gray-text)" },
  SENT: { label: "Sent to customer", background: "var(--blue-bg)", color: "var(--blue-text)" },
  VIEWED: { label: "Viewed by customer", background: "var(--teal-bg)", color: "var(--teal-text)" },
  PAID: { label: "Marked as paid", background: "var(--green-bg)", color: "var(--green-text)" },
  VOID: { label: "Voided", background: "var(--red-bg)", color: "var(--red-text)" },
};

// The invoice's business status (above) flips to SENT the instant "Save &
// send" is clicked — this is the separate, async outcome of actually
// getting the email out (see EmailSendStatus's doc comment), computed from
// the jobs-runner's SEND_INVOICE_EMAIL job rather than trusted from the UI
// having clicked a button.
const EMAIL_SEND_EVENT: Record<EmailSendStatus, { label: string; background: string; color: string }> = {
  SENDING: { label: "Sending…", background: "var(--blue-bg)", color: "var(--blue-text)" },
  SENT: { label: "Email delivered", background: "var(--green-bg)", color: "var(--green-text)" },
  FAILED: { label: "Failed to send", background: "var(--red-bg)", color: "var(--red-text)" },
};

function money(amount: number | string): string {
  return `£${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function toDraftLineItems(invoice: Invoice): InvoiceLineItemInput[] {
  return invoice.lineItems.map((li, i) => ({
    description: li.description,
    type: li.type,
    quantity: Number(li.quantity),
    unitPrice: Number(li.unitPrice),
    sortOrder: i,
  }));
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuthToken();
  const { account } = useAccount();

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItemInput[]>([]);
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [amountPaid, setAmountPaid] = useState("");
  const [paidMethod, setPaidMethod] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [retryingEmail, setRetryingEmail] = useState(false);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const inv = await getInvoice(token, id);
      setInvoice(inv);
      setLineItems(toDraftLineItems(inv));
      setNotes(inv.notesToCustomer ?? "");
      setDueDate(inv.dueDate ? inv.dueDate.slice(0, 10) : "");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id, getToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // The email send happens out-of-band in the jobs-runner (brief §9/§10) —
  // while it's in flight there's nothing here to react to yet, so poll
  // until it resolves one way or the other rather than leaving "Sending…"
  // stuck until the user manually reloads.
  const emailSendStatus = invoice?.emailSend?.status;
  useEffect(() => {
    if (emailSendStatus !== "SENDING") return;
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [emailSendStatus, refresh]);

  if (error && !invoice) {
    return <div style={{ fontSize: 13, color: "var(--red-text)" }}>{error}</div>;
  }
  if (!invoice) {
    return <div style={{ fontSize: 13, color: "var(--text-faint)" }}>Loading…</div>;
  }

  const isDraft = invoice.status === "DRAFT";
  const cleanLineItems = lineItems.filter((li) => li.description.trim().length > 0);
  const liveTotals = calculateInvoiceTotals(cleanLineItems, Number(invoice.taxRate));

  function updateLine(i: number, patch: Partial<InvoiceLineItemInput>) {
    setLineItems((items) => items.map((li, idx) => (idx === i ? { ...li, ...patch } : li)));
  }
  function addLine() {
    setLineItems((items) => [...items, { description: "", type: "LABOUR", quantity: 1, unitPrice: 0, sortOrder: items.length }]);
  }
  function removeLine(i: number) {
    setLineItems((items) => items.filter((_, idx) => idx !== i));
  }

  async function saveDraft() {
    const token = await getToken();
    if (!token) throw new Error("Not signed in");
    await updateInvoice(token, invoice!.id, {
      lineItems: cleanLineItems,
      dueDate: dueDate || undefined,
      notesToCustomer: notes || undefined,
    });
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveDraft();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    setSaving(true);
    setError(null);
    try {
      await saveDraft();
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      await sendInvoice(token, invoice!.id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkPaid(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      await markInvoicePaid(token, invoice!.id, { amountPaid: Number(amountPaid), paidMethod });
      setShowMarkPaid(false);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleVoid() {
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      await voidInvoice(token, invoice!.id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRetryEmail() {
    setRetryingEmail(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      await resendInvoiceEmail(token, invoice!.id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRetryingEmail(false);
    }
  }

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const url = await getInvoicePdfUrl(token, invoice!.id);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice!.invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="#" onClick={(e) => { e.preventDefault(); navigate("/invoices"); }} style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
            Invoices
          </a>
          <span style={{ color: "var(--text-faint)" }}>/</span>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 20 }}>{invoice.invoiceNumber}</div>
          <InvoiceStatusBadge status={invoice.status} overdue={invoice.overdue} />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn-secondary" onClick={handleDownloadPdf} disabled={downloadingPdf}>
            <DownloadIcon />
            {downloadingPdf ? "Preparing…" : "Download PDF"}
          </button>
          {isDraft && (
            <button className="btn-primary" onClick={handleSend} disabled={saving || cleanLineItems.length === 0}>
              {saving ? "Sending…" : "Save & send"}
            </button>
          )}
          {(invoice.status === "SENT" || invoice.status === "VIEWED") && (
            <button className="btn-primary" onClick={() => setShowMarkPaid((s) => !s)} disabled={saving}>
              Mark as paid
            </button>
          )}
          {(invoice.status === "DRAFT" || invoice.status === "SENT" || invoice.status === "VIEWED") && (
            <a href="#" onClick={(e) => { e.preventDefault(); if (!saving) handleVoid(); }} style={{ fontSize: 13, fontWeight: 600, color: "var(--red-text)", padding: "0 4px" }}>
              Void
            </a>
          )}
        </div>
      </div>

      {error && <div style={{ marginBottom: 16, fontSize: 13, color: "var(--red-text)" }}>{error}</div>}

      {showMarkPaid && (
        <form onSubmit={handleMarkPaid} className="card" style={{ padding: 20, display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Amount paid</label>
            <div className="input">
              <input type="number" min="0" step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} required />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Method</label>
            <div className="input">
              <input placeholder="Bank transfer" value={paidMethod} onChange={(e) => setPaidMethod(e.target.value)} required />
            </div>
          </div>
          <button className="btn-primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Confirm payment"}
          </button>
        </form>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, alignItems: "start" }}>
        {/* Invoice document */}
        <div className="card" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>{account?.businessName}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                {[account?.addressLine1, account?.city, account?.postcode].filter(Boolean).join(", ")}
                {account?.addressLine1 && <br />}
                {account?.contactEmail}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "right" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Bill to
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{invoice.customer.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                {[invoice.customer.email, invoice.customer.phone].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 36, padding: "16px 0", borderTop: "1px solid var(--border-soft)", borderBottom: "1px solid var(--border-soft)" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Invoice number</div>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 4 }}>{invoice.invoiceNumber}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Issue date</div>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 4 }}>{formatDate(invoice.issueDate)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Due date</div>
              {isDraft ? (
                <div className="input" style={{ marginTop: 4, height: 32 }}>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              ) : (
                <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 4 }}>{formatDate(invoice.dueDate)}</div>
              )}
            </div>
          </div>

          <div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isDraft ? "0.8fr 3fr 0.7fr 0.9fr 0.9fr 24px" : "0.8fr 3fr 0.7fr 0.9fr 0.9fr",
                padding: "0 4px 8px 4px",
                borderBottom: "1px solid var(--border)",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-faint)",
                textTransform: "uppercase",
                letterSpacing: "0.03em",
              }}
            >
              <div>Type</div>
              <div>Description</div>
              <div>Qty</div>
              <div>Unit price</div>
              <div style={{ textAlign: "right" }}>Total</div>
              {isDraft && <div />}
            </div>

            {lineItems.map((li, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: isDraft ? "0.8fr 3fr 0.7fr 0.9fr 0.9fr 24px" : "0.8fr 3fr 0.7fr 0.9fr 0.9fr",
                  alignItems: "center",
                  padding: "8px 4px",
                  borderBottom: "1px solid var(--border-soft)",
                  fontSize: 13,
                  gap: 6,
                }}
              >
                {isDraft ? (
                  <>
                    <select
                      value={li.type}
                      onChange={(e) => updateLine(i, { type: e.target.value as LineItemType })}
                      style={{ border: "1px solid var(--border)", borderRadius: 6, height: 30, fontSize: 12.5, background: "var(--surface)", color: "var(--text-muted)" }}
                    >
                      {LINE_ITEM_TYPES.map((t) => (
                        <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                      ))}
                    </select>
                    <input
                      value={li.description}
                      onChange={(e) => updateLine(i, { description: e.target.value })}
                      placeholder="Description"
                      style={{ border: "1px solid var(--border)", borderRadius: 6, height: 30, fontSize: 13, padding: "0 8px" }}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={li.quantity}
                      onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                      style={{ border: "1px solid var(--border)", borderRadius: 6, height: 30, fontSize: 13, padding: "0 8px", width: "100%" }}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={li.unitPrice}
                      onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })}
                      style={{ border: "1px solid var(--border)", borderRadius: 6, height: 30, fontSize: 13, padding: "0 8px", width: "100%" }}
                    />
                    <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(li.quantity * li.unitPrice)}</div>
                    <button type="button" onClick={() => removeLine(i)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>
                      ×
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ color: "var(--text-muted)" }}>{TYPE_LABEL[li.type]}</div>
                    <div>{li.description}</div>
                    <div>{li.quantity}</div>
                    <div>{money(li.unitPrice)}</div>
                    <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(li.quantity * li.unitPrice)}</div>
                  </>
                )}
              </div>
            ))}

            {isDraft && (
              <button
                type="button"
                onClick={addLine}
                className="btn-secondary"
                style={{ marginTop: 10, height: 32, padding: "0 12px", fontSize: 12.5 }}
              >
                <PlusIcon />
                Add line item
              </button>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div style={{ width: 230, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-muted)" }}>
                <div>Subtotal</div>
                <div style={{ fontVariantNumeric: "tabular-nums" }}>{money(isDraft ? liveTotals.subtotal : invoice.subtotal)}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-muted)" }}>
                <div>Tax ({Math.round(Number(invoice.taxRate) * 100)}%)</div>
                <div style={{ fontVariantNumeric: "tabular-nums" }}>{money(isDraft ? liveTotals.taxAmount : invoice.taxAmount)}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--border)", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16 }}>
                <div>Total</div>
                <div style={{ fontVariantNumeric: "tabular-nums" }}>{money(isDraft ? liveTotals.total : invoice.total)}</div>
              </div>
            </div>
          </div>

          <div style={{ paddingTop: 14, borderTop: "1px solid var(--border-soft)" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
              Notes
            </div>
            {isDraft ? (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Payment due within 14 days…"
                rows={2}
                style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: 10, fontSize: 12.5, fontFamily: "var(--font-body)", resize: "vertical" }}
              />
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{invoice.notesToCustomer || "—"}</div>
            )}
          </div>

          {isDraft && (
            <div>
              <button className="btn-secondary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save draft"}
              </button>
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {invoice.emailSend && (
            <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14 }}>Email delivery</div>
              <div>
                <span className="pill" style={{ background: EMAIL_SEND_EVENT[invoice.emailSend.status].background, color: EMAIL_SEND_EVENT[invoice.emailSend.status].color }}>
                  <span className="dot" />
                  {EMAIL_SEND_EVENT[invoice.emailSend.status].label}
                </span>
              </div>

              {invoice.emailSend.status === "SENT" && account?.contactEmail && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                  A copy was also BCC'd to <strong>{account.contactEmail}</strong> — keep it as proof of sending if a
                  customer disputes receiving their invoice.
                </div>
              )}

              {invoice.emailSend.status === "FAILED" && (
                <>
                  {invoice.emailSend.lastError && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{invoice.emailSend.lastError}</div>
                  )}
                  <div>
                    <button className="btn-secondary" onClick={handleRetryEmail} disabled={retryingEmail} style={{ height: 32, padding: "0 12px", fontSize: 12.5 }}>
                      {retryingEmail ? "Retrying…" : "Retry send"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14 }}>Status timeline</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {invoice.statusEvents.map((event, i) => {
                const spec = STATUS_EVENT[event.toStatus];
                const isLast = i === invoice.statusEvents.length - 1;
                return (
                  <div key={event.id} style={{ display: "flex", gap: 12 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ width: 20, height: 20, borderRadius: 999, background: spec.background, color: spec.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span className="dot" />
                      </div>
                      {!isLast && <div style={{ width: 1.5, flex: 1, background: "var(--border)", minHeight: 20 }} />}
                    </div>
                    <div style={{ paddingBottom: isLast ? 0 : 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{spec.label}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 2 }}>
                        {new Date(event.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                );
              })}
              {invoice.overdue && (
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 999, background: "var(--red-bg)", color: "var(--red-text)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span className="dot" />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--red-text)" }}>Now overdue</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14 }}>Customer</div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{invoice.customer.name}</div>
            {invoice.customer.email && <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{invoice.customer.email}</div>}
            {invoice.customer.phone && <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{invoice.customer.phone}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
