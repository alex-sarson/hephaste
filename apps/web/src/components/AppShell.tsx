// The 240px dark sidebar + main content shell — see design/Main.dc.html and
// design/Styleguide.dc.html's "Layout principles". Every authenticated
// route renders inside this.
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { isDevAuth } from "../auth/context.js";
import {
  BrandMark,
  CustomersIcon,
  DashboardIcon,
  InvoicesIcon,
  JobsIcon,
  SettingsIcon,
} from "./icons.js";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: DashboardIcon },
  { to: "/jobs", label: "Jobs", icon: JobsIcon },
  { to: "/invoices", label: "Invoices", icon: InvoicesIcon },
  { to: "/customers", label: "Customers", icon: CustomersIcon },
];

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div style={{ display: "flex", minHeight: "100%", background: "var(--bg)" }}>
      <aside
        style={{
          width: 240,
          flexShrink: 0,
          background: "var(--sidebar-bg)",
          display: "flex",
          flexDirection: "column",
          padding: "24px 16px",
          gap: 4,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px 24px 8px" }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <BrandMark />
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 16,
              color: "oklch(96% 0.006 70)",
              letterSpacing: "-0.01em",
            }}
          >
            Trade Platform
          </div>
        </div>

        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to;
          return (
            <Link key={to} to={to} className={`navlink${active ? " active" : ""}`}>
              <Icon />
              {label}
            </Link>
          );
        })}

        <div style={{ height: 1, background: "oklch(100% 0 0 / 0.08)", margin: "12px 4px" }} />

        <Link to="/settings" className={`navlink${location.pathname === "/settings" ? " active" : ""}`}>
          <SettingsIcon />
          Settings
        </Link>

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 8px 4px 8px",
            borderTop: "1px solid oklch(100% 0 0 / 0.08)",
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 999,
              background: "var(--sidebar-active-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: 12,
              color: "var(--accent-soft)",
              flexShrink: 0,
            }}
          >
            DT
          </div>
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: "oklch(93% 0.01 60)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Dev Trades Co.
            </div>
            <div style={{ fontSize: 11, color: "var(--sidebar-text-muted)" }}>
              {isDevAuth ? "Dev mode" : "Free plan"}
            </div>
          </div>
          {!isDevAuth && <UserButton />}
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, padding: "32px 40px" }}>{children}</main>
    </div>
  );
}
