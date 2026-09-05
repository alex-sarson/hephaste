// The PDF's layout intentionally doesn't try to reproduce the web app's
// oklch design tokens exactly (react-pdf's styling is its own box model,
// not CSS) — it mirrors the same information architecture as
// InvoiceDetailPage/design/Invoices.dc.html (bill-from/bill-to, line
// items, totals, notes) in a plain, printable document.
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { InvoicePdfData } from "./index.js";

const ACCENT = "#B5502E";
const MUTED = "#6B6158";
const BORDER = "#DDD5CB";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#241A10" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  businessName: { fontSize: 14, fontWeight: 700, color: ACCENT, marginBottom: 4 },
  muted: { color: MUTED, lineHeight: 1.5 },
  billToLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  metaRow: {
    flexDirection: "row",
    gap: 32,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    marginBottom: 20,
  },
  metaLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 },
  metaValue: { fontSize: 11, fontWeight: 700 },
  table: { marginBottom: 20 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#B8ACA0",
    paddingBottom: 6,
    marginBottom: 4,
  },
  tableHeaderCell: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderColor: BORDER },
  colType: { width: "15%" },
  colDescription: { width: "45%" },
  colQty: { width: "10%" },
  colPrice: { width: "15%" },
  colTotal: { width: "15%", textAlign: "right" },
  totals: { alignSelf: "flex-end", width: 200, marginBottom: 20 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: "#B8ACA0",
  },
  grandTotalLabel: { fontSize: 13, fontWeight: 700 },
  grandTotalValue: { fontSize: 13, fontWeight: 700 },
  section: { paddingTop: 12, borderTopWidth: 1, borderColor: BORDER, marginBottom: 12 },
  sectionLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
});

function money(amount: number): string {
  return `£${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const TYPE_LABEL: Record<string, string> = { LABOUR: "Labour", MATERIALS: "Materials", OTHER: "Other" };

export function InvoiceDocument({ data }: { data: InvoicePdfData }) {
  const { business, customer } = data;
  return (
    <Document title={`Invoice ${data.invoiceNumber}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.businessName}>{business.name}</Text>
            <Text style={styles.muted}>
              {[business.addressLine1, business.city, business.postcode].filter(Boolean).join(", ")}
            </Text>
            <Text style={styles.muted}>{business.email}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.billToLabel}>Bill to</Text>
            <Text style={{ fontWeight: 700, marginBottom: 4 }}>{customer.name}</Text>
            <Text style={styles.muted}>
              {[customer.addressLine1, customer.city, customer.postcode].filter(Boolean).join(", ")}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View>
            <Text style={styles.metaLabel}>Invoice number</Text>
            <Text style={styles.metaValue}>{data.invoiceNumber}</Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>Issue date</Text>
            <Text style={styles.metaValue}>{formatDate(data.issueDate)}</Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>Due date</Text>
            <Text style={styles.metaValue}>{formatDate(data.dueDate)}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colType]}>Type</Text>
            <Text style={[styles.tableHeaderCell, styles.colDescription]}>Description</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>Qty</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrice]}>Unit price</Text>
            <Text style={[styles.tableHeaderCell, styles.colTotal]}>Total</Text>
          </View>
          {data.lineItems.map((li, i) => (
            <View key={i} style={styles.row}>
              <Text style={[styles.colType, styles.muted]}>{TYPE_LABEL[li.type] ?? li.type}</Text>
              <Text style={styles.colDescription}>{li.description}</Text>
              <Text style={styles.colQty}>{li.quantity}</Text>
              <Text style={styles.colPrice}>{money(li.unitPrice)}</Text>
              <Text style={styles.colTotal}>{money(li.lineTotal)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalsRow}>
            <Text style={styles.muted}>Subtotal</Text>
            <Text>{money(data.subtotal)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.muted}>Tax ({Math.round(data.taxRate * 100)}%)</Text>
            <Text>{money(data.taxAmount)}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>{money(data.total)}</Text>
          </View>
        </View>

        {data.notesToCustomer && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={styles.muted}>{data.notesToCustomer}</Text>
          </View>
        )}

        {business.bankAccountName && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Payment details</Text>
            <Text style={styles.muted}>
              {business.bankAccountName}
              {business.bankSortCode ? ` · Sort code ${business.bankSortCode}` : ""}
              {business.bankAccountNumber ? ` · Account ${business.bankAccountNumber}` : ""}
            </Text>
          </View>
        )}
      </Page>
    </Document>
  );
}
