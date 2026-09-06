// The one thing missing that actually blocked using the app end-to-end:
// JobsPage/InvoicesPage both render a chevron on every row, but nothing
// was clickable and there was no way to move a job past QUOTED — which
// meant it could never reach COMPLETE and become invoiceable. This closes
// that gap: view/edit a job's details, move it through its status
// pipeline, manage materials, and create an invoice once it's done.
//
// Unlike InvoiceDetailPage, there's no DRAFT-style lock here — the API
// (jobsRepo.update/updateStatus) allows editing a job in any status, and
// status itself isn't a validated state machine the way invoice status is
// (see @hephaste/invoice-engine's assertValidTransition) — any
// status can be set from any other, matched here with a plain dropdown
// rather than a "next step" button that would imply an ordering the
// backend doesn't actually enforce.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { JobLocationType, JobStatus } from "@hephaste/shared-types";
import { useAuthToken } from "../auth/context.js";
import { useTerminology } from "../account/context.js";
import {
  addJobMaterial,
  getJob,
  removeJobMaterial,
  updateJob,
  updateJobStatus,
  type JobDetail,
} from "../api-client/jobs.js";
import { createInvoice } from "../api-client/invoices.js";
import { JobStatusBadge, InvoiceStatusBadge } from "../components/StatusBadge.js";
import { PlusIcon } from "../components/icons.js";

const STATUS_OPTIONS: JobStatus[] = ["QUOTED", "SCHEDULED", "IN_PROGRESS", "COMPLETE", "CANCELLED"];
const STATUS_LABEL: Record<JobStatus, string> = {
  QUOTED: "Quoted",
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  COMPLETE: "Complete",
  CANCELLED: "Cancelled",
};

const LOCATION_OPTIONS: JobLocationType[] = ["ON_SITE", "REMOTE", "IN_HOUSE"];
const LOCATION_LABEL: Record<JobLocationType, string> = {
  ON_SITE: "On-site (customer's location)",
  REMOTE: "Remote",
  IN_HOUSE: "At our own location",
};

function money(amount: number | string): string {
  return `£${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time, not
// the UTC ISO string the API returns — slicing an ISO string the way
// InvoiceDetailPage's due-date field does would silently shift the
// displayed time for anyone not in UTC.
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuthToken();
  const terminology = useTerminology();

  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationType, setLocationType] = useState<JobLocationType>("ON_SITE");
  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [notes, setNotes] = useState("");

  const [materialDescription, setMaterialDescription] = useState("");
  const [materialQuantity, setMaterialQuantity] = useState("1");
  const [materialUnitCost, setMaterialUnitCost] = useState("");
  const [addingMaterial, setAddingMaterial] = useState(false);

  // Re-fetches the job and repopulates every form field from it — only
  // right for the initial load. Calling this after a side action (status
  // change, add/remove material) would blow away whatever the user is
  // mid-typing in the details form below, which is exactly the bug this
  // split avoids — see refreshJobOnly.
  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const j = await getJob(token, id);
      setJob(j);
      setTitle(j.title);
      setDescription(j.description ?? "");
      setLocationType(j.locationType);
      setScheduledStart(toLocalInputValue(j.scheduledStart));
      setScheduledEnd(toLocalInputValue(j.scheduledEnd));
      setAddressLine1(j.addressLine1 ?? "");
      setAddressLine2(j.addressLine2 ?? "");
      setCity(j.city ?? "");
      setPostcode(j.postcode ?? "");
      setNotes(j.notes ?? "");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id, getToken]);

  // Updates job (status badge, materials list, invoices list) without
  // touching the details form's own state — used after any action that
  // isn't the details form's own Save, so unsaved edits there survive.
  const refreshJobOnly = useCallback(async () => {
    if (!id) return;
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      setJob(await getJob(token, id));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id, getToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (error && !job) {
    return <div style={{ fontSize: 13, color: "var(--red-text)" }}>{error}</div>;
  }
  if (!job) {
    return <div style={{ fontSize: 13, color: "var(--text-faint)" }}>Loading…</div>;
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      await updateJob(token, job!.id, {
        title,
        description: description || undefined,
        locationType,
        // updateJobSchema's z.coerce.date() types these as Date, not
        // string, even though the API happily coerces a JSON string too —
        // constructing the Date client-side satisfies that and serializes
        // to the same ISO string either way.
        scheduledStart: scheduledStart ? new Date(scheduledStart) : undefined,
        scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : undefined,
        addressLine1: addressLine1 || undefined,
        addressLine2: addressLine2 || undefined,
        city: city || undefined,
        postcode: postcode || undefined,
        notes: notes || undefined,
      });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(status: JobStatus) {
    setStatusSaving(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      await updateJobStatus(token, job!.id, status);
      await refreshJobOnly();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStatusSaving(false);
    }
  }

  async function handleAddMaterial(e: FormEvent) {
    e.preventDefault();
    setAddingMaterial(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      await addJobMaterial(token, job!.id, {
        description: materialDescription,
        quantity: Number(materialQuantity),
        unitCost: Number(materialUnitCost),
      });
      setMaterialDescription("");
      setMaterialQuantity("1");
      setMaterialUnitCost("");
      await refreshJobOnly();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAddingMaterial(false);
    }
  }

  async function handleRemoveMaterial(materialId: string) {
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      await removeJobMaterial(token, job!.id, materialId);
      await refreshJobOnly();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateInvoice() {
    setCreatingInvoice(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const invoice = await createInvoice(token, job!.id);
      navigate(`/invoices/${invoice.id}`);
    } catch (err) {
      setError((err as Error).message);
      setCreatingInvoice(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="#" onClick={(e) => { e.preventDefault(); navigate("/jobs"); }} style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
            {terminology.job.plural}
          </a>
          <span style={{ color: "var(--text-faint)" }}>/</span>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 20 }}>{job.title}</div>
          <JobStatusBadge status={job.status} />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div className="input" style={{ height: 34 }}>
            <select
              value={job.status}
              disabled={statusSaving}
              onChange={(e) => handleStatusChange(e.target.value as JobStatus)}
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, width: "100%" }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
          {job.status === "COMPLETE" && (
            <button className="btn-primary" onClick={handleCreateInvoice} disabled={creatingInvoice}>
              {creatingInvoice ? "Creating…" : "Create invoice"}
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ marginBottom: 16, fontSize: 13, color: "var(--red-text)" }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, alignItems: "start" }}>
        {/* Details */}
        <form onSubmit={handleSave} className="card" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Title</label>
            <div className="input">
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: 10, fontSize: 13, fontFamily: "var(--font-body)", resize: "vertical" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Scheduled start</label>
              <div className="input">
                <input type="datetime-local" value={scheduledStart} onChange={(e) => setScheduledStart(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Scheduled end</label>
              <div className="input">
                <input type="datetime-local" value={scheduledEnd} onChange={(e) => setScheduledEnd(e.target.value)} />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Location</label>
            <div className="input">
              <select
                value={locationType}
                onChange={(e) => setLocationType(e.target.value as JobLocationType)}
                style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, width: "100%" }}
              >
                {LOCATION_OPTIONS.map((l) => (
                  <option key={l} value={l}>{LOCATION_LABEL[l]}</option>
                ))}
              </select>
            </div>
          </div>

          {locationType === "ON_SITE" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Site address</label>
              <div className="input" style={{ marginBottom: 8 }}>
                <input placeholder="Address line 1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
              </div>
              <div className="input" style={{ marginBottom: 8 }}>
                <input placeholder="Address line 2" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
                <div className="input">
                  <input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div className="input">
                  <input placeholder="Postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
                </div>
              </div>
            </div>
          ) : (
            // Not cleared server-side on switch — just hidden, so flipping
            // back to on-site later doesn't lose whatever was entered
            // before. locationType alone is the source of truth for
            // whether an address is relevant, not whether one is present.
            <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>
              No site address needed — this job is {LOCATION_LABEL[locationType].toLowerCase()}.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: 10, fontSize: 12.5, fontFamily: "var(--font-body)", resize: "vertical" }}
            />
          </div>

          <div>
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14 }}>{terminology.customer.singular}</div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{job.customer.name}</div>
            {job.customer.email && <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{job.customer.email}</div>}
            {job.customer.phone && <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{job.customer.phone}</div>}
          </div>

          {job.invoices.length > 0 && (
            <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14 }}>Invoices</div>
              {job.invoices.map((inv) => (
                <a
                  key={inv.id}
                  href="#"
                  onClick={(e) => { e.preventDefault(); navigate(`/invoices/${inv.id}`); }}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, fontWeight: 600 }}
                >
                  {inv.invoiceNumber}
                  <InvoiceStatusBadge status={inv.status} />
                </a>
              ))}
            </div>
          )}

          <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14 }}>{terminology.asset.plural}</div>

            {job.materials.length === 0 && (
              <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>
                No {terminology.asset.plural.toLowerCase()} logged yet.
              </div>
            )}

            {job.materials.map((m) => (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{m.description}</div>
                  <div style={{ color: "var(--text-muted)" }}>
                    {Number(m.quantity)} × {money(m.unitCost)} = {money(Number(m.quantity) * Number(m.unitCost))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveMaterial(m.id)}
                  style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
            ))}

            <form onSubmit={handleAddMaterial} style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 8, borderTop: "1px solid var(--border-soft)" }}>
              <div className="input">
                <input
                  placeholder={`${terminology.asset.singular} description`}
                  value={materialDescription}
                  onChange={(e) => setMaterialDescription(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div className="input">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Qty"
                    value={materialQuantity}
                    onChange={(e) => setMaterialQuantity(e.target.value)}
                    required
                  />
                </div>
                <div className="input">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Unit cost"
                    value={materialUnitCost}
                    onChange={(e) => setMaterialUnitCost(e.target.value)}
                    required
                  />
                </div>
              </div>
              <button className="btn-secondary" type="submit" disabled={addingMaterial} style={{ height: 32, padding: "0 12px", fontSize: 12.5 }}>
                <PlusIcon />
                Add {terminology.asset.singular.toLowerCase()}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
