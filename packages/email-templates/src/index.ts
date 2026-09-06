// Real templates (invoice-sent, payment-reminder) — brief §9. Plain
// hand-written HTML string rather than @react-email/components: the one
// template needed so far is simple enough that pulling in a rendering
// pipeline wasn't worth it yet. Revisit once a second template (payment
// reminder, Phase 2) makes the duplication worth factoring out.

export interface InvoiceEmailData {
  businessName: string;
  customerName: string;
  invoiceNumber: string;
  total: number;
  currency: string;
  dueDate: string | null;
}

function formatMoney(total: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(total);
  } catch {
    // Intl throws on an unrecognized currency code — fall back rather than
    // let a bad Account.currency value crash the whole send.
    return `${currency} ${total.toFixed(2)}`;
  }
}

function formatDueDate(dueDate: string | null): string | null {
  if (!dueDate) return null;
  return new Date(dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function renderInvoiceSentEmail(data: InvoiceEmailData): {
  subject: string;
  html: string;
} {
  const amount = formatMoney(data.total, data.currency);
  const due = formatDueDate(data.dueDate);
  const subject = `Invoice ${data.invoiceNumber} from ${data.businessName}`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 24px 32px;">
                <p style="margin:0 0 4px 0;font-size:13px;color:#71717a;">${escapeHtml(data.businessName)}</p>
                <h1 style="margin:0;font-size:20px;color:#18181b;">Invoice ${escapeHtml(data.invoiceNumber)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px 32px;font-size:14px;color:#27272a;line-height:1.6;">
                <p style="margin:0 0 16px 0;">Hi ${escapeHtml(data.customerName)},</p>
                <p style="margin:0 0 16px 0;">
                  ${escapeHtml(data.businessName)} has sent you an invoice for <strong>${amount}</strong>${due ? ` due <strong>${due}</strong>` : ""}.
                </p>
                <p style="margin:0;">The invoice is attached to this email as a PDF.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa;">
                Sent via Trade Platform on behalf of ${escapeHtml(data.businessName)}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
