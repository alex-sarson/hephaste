// Admin console → account list (brief §5): who is on the product, and how
// much they use it. Counts only — customer, job and invoice content is
// deliberately not reachable from here.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthToken } from "../../auth/context.js";
import {
  listAdminAccounts,
  type AdminAccountRow,
} from "../../api-client/admin.js";
import { PageHeader } from "../../components/PageHeader.js";
import { ChevronRightIcon, SearchIcon } from "../../components/icons.js";

const GRID = "minmax(200px, 2fr) 0.9fr 0.7fr 0.7fr 0.7fr 0.9fr 32px";

export function AdminAccountsPage() {
  const { getToken } = useAuthToken();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [accounts, setAccounts] = useState<AdminAccountRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Debounced so typing doesn't fire a request per keystroke.
    const timer = setTimeout(async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Not signed in");
        setAccounts(await listAdminAccounts(token, search.trim()));
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [getToken, search]);

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle="Every business on Hephaste. Counts only — customer, job and invoice content stays private to each account."
      />

      {error && (
        <div
          style={{ marginBottom: 16, fontSize: 13, color: "var(--red-text)" }}
        >
          {error}
        </div>
      )}

      <div
        className="input"
        style={{ width: "100%", maxWidth: 320, marginBottom: 20 }}
      >
        <SearchIcon style={{ color: "var(--text-faint)" }} />
        <input
          id="admin-account-search"
          placeholder="Search by business or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card" style={{ padding: "8px 24px 4px 24px" }}>
        <div className="table-scroll">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: GRID,
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
            <div>Business</div>
            <div>Industry</div>
            <div>Customers</div>
            <div>Jobs</div>
            <div>Invoices</div>
            <div>Joined</div>
            <div />
          </div>

          {accounts === null && !error && (
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
          {accounts !== null && accounts.length === 0 && (
            <div
              style={{
                padding: "24px 4px",
                fontSize: 13,
                color: "var(--text-faint)",
              }}
            >
              No accounts match.
            </div>
          )}

          {(accounts ?? []).map((a, i) => (
            <div
              key={a.id}
              onClick={() => navigate(`/admin/accounts/${a.id}`)}
              style={{
                display: "grid",
                gridTemplateColumns: GRID,
                minWidth: 720,
                alignItems: "center",
                padding: "13px 4px",
                borderBottom:
                  i < accounts!.length - 1
                    ? "1px solid var(--border-soft)"
                    : undefined,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.businessName}
                  </span>
                  {a.deletedAt && (
                    <span
                      className="pill"
                      style={{
                        background: "var(--gray-bg)",
                        color: "var(--gray-text)",
                      }}
                    >
                      Deleted
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {a.contactEmail}
                </div>
              </div>
              <div
                style={{
                  color: "var(--text-muted)",
                  textTransform: "capitalize",
                }}
              >
                {a.industry.toLowerCase()}
              </div>
              <div>{a.customerCount}</div>
              <div>{a.jobCount}</div>
              <div>{a.invoiceCount}</div>
              <div style={{ color: "var(--text-muted)" }}>
                {new Date(a.createdAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </div>
              <ChevronRightIcon style={{ color: "var(--text-faint)" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
