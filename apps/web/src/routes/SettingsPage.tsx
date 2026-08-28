// Phase 1: company profile setup — business details, logo, bank details,
// default tax rate, invoice numbering prefix — see brief §6. No design
// canvas mockup exists for this screen yet; styled to the same card/shell
// conventions as the rest of the app in the meantime.
import { PageHeader } from "../components/PageHeader.js";

export function SettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" subtitle="Your business profile and invoice defaults." />
      <div className="card" style={{ padding: "32px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 13.5, color: "var(--text-muted)" }}>
          Company profile, logo, bank details, and default tax rate will live here.
        </div>
      </div>
    </div>
  );
}
