// Company profile / invoicing defaults (brief §6 — "account/company
// profile setup", the first MVP feature, previously a placeholder). No
// design canvas mockup exists for this screen; styled to the same
// card/input/btn-primary conventions as the rest of the app, matching the
// precedent already set here. Logo upload is out of scope — it needs a
// file-storage decision, unlike everything else here (plain text fields).
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useAuthToken } from "../auth/context.js";
import { useAccount } from "../account/context.js";
import { updateAccountProfile, type Account } from "../api-client/account.js";
import { PageHeader } from "../components/PageHeader.js";

type FormState = Pick<
  Account,
  | "businessName"
  | "contactEmail"
  | "contactPhone"
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "postcode"
  | "country"
  | "vatNumber"
  | "defaultTaxRate"
  | "invoiceNumberPrefix"
  | "currency"
  | "bankAccountName"
  | "bankSortCode"
  | "bankAccountNumber"
>;

function toFormState(account: Account): FormState {
  return {
    businessName: account.businessName,
    contactEmail: account.contactEmail,
    contactPhone: account.contactPhone,
    addressLine1: account.addressLine1,
    addressLine2: account.addressLine2,
    city: account.city,
    postcode: account.postcode,
    country: account.country,
    vatNumber: account.vatNumber,
    defaultTaxRate: account.defaultTaxRate,
    invoiceNumberPrefix: account.invoiceNumberPrefix,
    currency: account.currency,
    bankAccountName: account.bankAccountName,
    bankSortCode: account.bankSortCode,
    bankAccountNumber: account.bankAccountNumber,
  };
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>{label}</label>
      <div className="input">
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15 }}>{title}</div>
      {children}
    </div>
  );
}

export function SettingsPage() {
  const { getToken } = useAuthToken();
  const { account, refresh } = useAccount();
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (account) setForm(toFormState(account));
  }, [account]);

  if (!form) {
    return <div style={{ fontSize: 13, color: "var(--text-faint)" }}>Loading…</div>;
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      await updateAccountProfile(token, {
        ...form,
        contactPhone: form.contactPhone ?? undefined,
        addressLine1: form.addressLine1 ?? undefined,
        addressLine2: form.addressLine2 ?? undefined,
        city: form.city ?? undefined,
        postcode: form.postcode ?? undefined,
        country: form.country ?? undefined,
        vatNumber: form.vatNumber ?? undefined,
        defaultTaxRate: Number(form.defaultTaxRate),
        bankAccountName: form.bankAccountName ?? undefined,
        bankSortCode: form.bankSortCode ?? undefined,
        bankAccountNumber: form.bankAccountNumber ?? undefined,
      });
      await refresh();
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Your business profile and invoice defaults." />

      <form onSubmit={handleSubmit}>
        <Section title="Business details">
          <div style={{ display: "flex", gap: 12 }}>
            <Field label="Business name" value={form.businessName} onChange={(v) => set("businessName", v)} required />
            <Field label="Contact email" value={form.contactEmail} type="email" onChange={(v) => set("contactEmail", v)} required />
            <Field label="Contact phone" value={form.contactPhone ?? ""} onChange={(v) => set("contactPhone", v)} />
          </div>
        </Section>

        <Section title="Address">
          <div style={{ display: "flex", gap: 12 }}>
            <Field label="Address line 1" value={form.addressLine1 ?? ""} onChange={(v) => set("addressLine1", v)} />
            <Field label="Address line 2" value={form.addressLine2 ?? ""} onChange={(v) => set("addressLine2", v)} />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <Field label="City" value={form.city ?? ""} onChange={(v) => set("city", v)} />
            <Field label="Postcode" value={form.postcode ?? ""} onChange={(v) => set("postcode", v)} />
            <Field label="Country" value={form.country ?? ""} onChange={(v) => set("country", v)} />
          </div>
        </Section>

        <Section title="Invoicing">
          <div style={{ display: "flex", gap: 12 }}>
            <Field label="Invoice number prefix" value={form.invoiceNumberPrefix} onChange={(v) => set("invoiceNumberPrefix", v)} required />
            <Field label="Default tax rate (e.g. 0.2 for 20%)" value={form.defaultTaxRate} type="number" onChange={(v) => set("defaultTaxRate", v)} required />
            <Field label="Currency" value={form.currency} onChange={(v) => set("currency", v)} required />
            <Field label="VAT number" value={form.vatNumber ?? ""} onChange={(v) => set("vatNumber", v)} />
          </div>
        </Section>

        <Section title="Bank details">
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: -8 }}>
            Display-only — printed on invoice PDFs. No payment processing is performed against these.
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <Field label="Account name" value={form.bankAccountName ?? ""} onChange={(v) => set("bankAccountName", v)} />
            <Field label="Sort code" value={form.bankSortCode ?? ""} onChange={(v) => set("bankSortCode", v)} />
            <Field label="Account number" value={form.bankAccountNumber ?? ""} onChange={(v) => set("bankAccountNumber", v)} />
          </div>
        </Section>

        {error && <div style={{ marginBottom: 16, fontSize: 13, color: "var(--red-text)" }}>{error}</div>}

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn-primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          {saved && <div style={{ fontSize: 12.5, color: "var(--green-text)" }}>Saved.</div>}
        </div>
      </form>
    </div>
  );
}
