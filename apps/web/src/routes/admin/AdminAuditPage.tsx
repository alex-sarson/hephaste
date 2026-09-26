// Admin console → audit trail (SUPERADMIN only): every admin action against
// account data, newest first — the record that makes "admins can't normally
// see tenant content" (brief §5) verifiable.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthToken } from "../../auth/context.js";
import {
  listAdminAuditLogs,
  type AdminAuditEntry,
} from "../../api-client/admin.js";
import { PageHeader } from "../../components/PageHeader.js";

const ACTION_LABELS: Record<string, string> = {
  ACCOUNT_SUMMARY_VIEWED: "Viewed account summary",
  INVOICE_EMAIL_RESENT: "Retried invoice email",
};

export function AdminAuditPage() {
  const { getToken } = useAuthToken();
  const [entries, setEntries] = useState<AdminAuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Not signed in");
        setEntries(await listAdminAuditLogs(token));
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [getToken]);

  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle="Every admin action against an account, newest first."
      />
      {error && (
        <div
          style={{ marginBottom: 16, fontSize: 13, color: "var(--red-text)" }}
        >
          {error}
        </div>
      )}

      <div className="card" style={{ padding: "8px 24px 4px 24px" }}>
        <div className="table-scroll">
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "170px minmax(160px, 1fr) minmax(160px, 1fr) minmax(160px, 1fr)",
              minWidth: 720,
              padding: "12px 4px",
              borderBottom: "1px solid var(--border)",
              fontSize: 11.5,
              fontWeight: 600,
              color: "var(--text-faint)",
              textTransform: "uppercase",
              letterSpacing: "0.03em",
            }}
          >
            <div>When</div>
            <div>Admin</div>
            <div>Action</div>
            <div>Account</div>
          </div>

          {entries === null && !error && (
            <div
              style={{
                padding: "24px 4px",
                fontSize: 13,
                color: "var(--text-faint)",
              }}
            >
              Loading…
            </div>
          )}
          {entries !== null && entries.length === 0 && (
            <div
              style={{
                padding: "24px 4px",
                fontSize: 13,
                color: "var(--text-faint)",
              }}
            >
              Nothing recorded yet.
            </div>
          )}

          {(entries ?? []).map((e, i) => (
            <div
              key={e.id}
              style={{
                display: "grid",
                gridTemplateColumns:
                  "170px minmax(160px, 1fr) minmax(160px, 1fr) minmax(160px, 1fr)",
                minWidth: 720,
                alignItems: "center",
                padding: "12px 4px",
                borderBottom:
                  i < entries!.length - 1
                    ? "1px solid var(--border-soft)"
                    : undefined,
                fontSize: 13,
              }}
            >
              <div
                style={{
                  color: "var(--text-muted)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {new Date(e.createdAt).toLocaleString(undefined, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </div>
              <div
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {e.adminEmail}
              </div>
              <div>{ACTION_LABELS[e.action] ?? e.action}</div>
              <div
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {e.targetAccountId ? (
                  <Link to={`/admin/accounts/${e.targetAccountId}`}>
                    {e.targetBusinessName ?? e.targetAccountId}
                  </Link>
                ) : (
                  "—"
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
