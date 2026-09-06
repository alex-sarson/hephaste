// Required one-time step, rendered by App.tsx in place of AppShell/Routes
// whenever account.onboardingCompletedAt is null (brief §3a). Picking an
// industry card prefills the label fields below from INDUSTRY_PRESETS —
// data-driven, so a newly added preset needs no change here — and every
// field stays editable before submit. No design canvas mockup exists for
// this screen; styled to the same card/input/btn-primary conventions as
// the rest of the app, matching the precedent set by SettingsPage.tsx.
import { useState, type FormEvent } from "react";
import { INDUSTRY_PRESETS, type Industry, type TerminologyInput } from "@hephaste/shared-types";
import { useAuthToken } from "../auth/context.js";
import { useAccount } from "../account/context.js";
import { updateTerminology } from "../api-client/account.js";
import { BrandMark } from "../components/icons.js";

const INDUSTRY_COPY: Record<Industry, { title: string; blurb: string }> = {
  TRADES: { title: "Trades", blurb: "Electricians, plumbers, builders" },
  BEAUTY: { title: "Beauty & Wellness", blurb: "Salons, therapists, freelancers" },
  ARTS: { title: "Arts & Commissions", blurb: "Illustrators, makers, designers" },
  OTHER: { title: "Other / Custom", blurb: "Pick your own words below" },
};

function labelsFromPreset(industry: Industry): TerminologyInput {
  const preset = INDUSTRY_PRESETS[industry];
  return {
    jobLabelSingular: preset.job.singular,
    jobLabelPlural: preset.job.plural,
    customerLabelSingular: preset.customer.singular,
    customerLabelPlural: preset.customer.plural,
    assetLabelSingular: preset.asset.singular,
    assetLabelPlural: preset.asset.plural,
  };
}

function LabelField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>{label}</label>
      <div className="input">
        <input value={value} onChange={(e) => onChange(e.target.value)} required maxLength={40} />
      </div>
    </div>
  );
}

export function OnboardingPage() {
  const { getToken } = useAuthToken();
  const { refresh } = useAccount();
  const [industry, setIndustry] = useState<Industry | null>(null);
  const [labels, setLabels] = useState<TerminologyInput | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectIndustry(next: Industry) {
    setIndustry(next);
    setLabels(labelsFromPreset(next));
  }

  function updateLabel(field: keyof TerminologyInput, value: string) {
    setLabels((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!industry || !labels) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      await updateTerminology(token, { industry, ...labels });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        justifyContent: "center",
        padding: "56px 24px",
        background: "var(--bg)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 640 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              background: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <BrandMark />
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16 }}>Hephaste</div>
        </div>

        <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 24, letterSpacing: "-0.01em" }}>
          What kind of work do you do?
        </div>
        <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginTop: 6, marginBottom: 24 }}>
          We'll use the right words for your business throughout the app — you can change these anytime in Settings.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
            {(Object.keys(INDUSTRY_PRESETS) as Industry[]).map((key) => {
              const selected = industry === key;
              return (
                <button
                  key={key}
                  type="button"
                  className="card"
                  onClick={() => selectIndustry(key)}
                  style={{
                    textAlign: "left",
                    padding: "16px 18px",
                    cursor: "pointer",
                    borderColor: selected ? "var(--accent)" : undefined,
                    background: selected ? "var(--accent-soft)" : undefined,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: selected ? "var(--accent-soft-text)" : "var(--text)" }}>
                    {INDUSTRY_COPY[key].title}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                    {INDUSTRY_COPY[key].blurb}
                  </div>
                </button>
              );
            })}
          </div>

          {labels && (
            <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)" }}>
                Edit the wording if you'd like — it's used throughout the app.
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <LabelField label="A job, singular" value={labels.jobLabelSingular} onChange={(v) => updateLabel("jobLabelSingular", v)} />
                <LabelField label="Jobs, plural" value={labels.jobLabelPlural} onChange={(v) => updateLabel("jobLabelPlural", v)} />
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <LabelField label="A customer, singular" value={labels.customerLabelSingular} onChange={(v) => updateLabel("customerLabelSingular", v)} />
                <LabelField label="Customers, plural" value={labels.customerLabelPlural} onChange={(v) => updateLabel("customerLabelPlural", v)} />
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <LabelField label="A material or product, singular" value={labels.assetLabelSingular} onChange={(v) => updateLabel("assetLabelSingular", v)} />
                <LabelField label="Materials or products, plural" value={labels.assetLabelPlural} onChange={(v) => updateLabel("assetLabelPlural", v)} />
              </div>
            </div>
          )}

          {error && <div style={{ marginBottom: 16, fontSize: 13, color: "var(--red-text)" }}>{error}</div>}

          <button className="btn-primary" type="submit" disabled={!industry || submitting}>
            {submitting ? "Setting up…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
