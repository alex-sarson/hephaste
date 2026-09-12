// The 240px dark sidebar + main content shell — see design/Main.dc.html and
// design/Styleguide.dc.html's "Layout principles". Every authenticated
// route renders inside this.
//
// Below tokens.css's 860px breakpoint the sidebar becomes an off-canvas
// drawer (closed by default) instead of squeezing 240px of fixed-width
// sidebar onto a phone screen — see .app-shell/.app-sidebar there for the
// actual responsive rules; the state here just toggles the `.open` class
// and closes automatically on navigation.
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { isDevAuth } from "../auth/context.js";
import { useTerminology } from "../account/context.js";
import {
  BrandMark,
  CloseIcon,
  CustomersIcon,
  DashboardIcon,
  InvoicesIcon,
  JobsIcon,
  MenuIcon,
  SettingsIcon,
} from "./icons.js";

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const terminology = useTerminology();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Closing on every route change (rather than requiring an explicit tap
  // on the overlay/nav link) matches how a mobile drawer nav is expected
  // to behave — picking a destination should always dismiss it.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const navItems = [
    { to: "/", label: "Dashboard", icon: DashboardIcon },
    { to: "/jobs", label: terminology.job.plural, icon: JobsIcon },
    { to: "/invoices", label: "Invoices", icon: InvoicesIcon },
    { to: "/customers", label: terminology.customer.plural, icon: CustomersIcon },
  ];

  return (
    <div className="app-shell">
      <div className="app-topbar">
        <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
          <MenuIcon />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 999,
              background: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <BrandMark width={15} height={15} />
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
            Hephaste
          </div>
        </div>
      </div>

      <div className={`app-sidebar-overlay${drawerOpen ? " open" : ""}`} onClick={() => setDrawerOpen(false)} />

      <aside className={`app-sidebar${drawerOpen ? " open" : ""}`}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px 24px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 16,
                color: "var(--text)",
                letterSpacing: "-0.01em",
              }}
            >
              Hephaste
            </div>
          </div>
          {/* Only reachable when the drawer is open (mobile) — hidden by
              the desktop layout's fixed sidebar having no overlay/topbar
              to close in the first place. */}
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            className="app-drawer-close"
            style={{ background: "none", border: "none", color: "var(--sidebar-text)", cursor: "pointer", padding: 4 }}
          >
            <CloseIcon />
          </button>
        </div>

        {navItems.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to;
          return (
            <Link key={to} to={to} className={`navlink${active ? " active" : ""}`}>
              <Icon />
              {label}
            </Link>
          );
        })}

        <div style={{ height: 1, background: "oklch(0% 0 0 / 0.08)", margin: "12px 4px" }} />

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
            borderTop: "1px solid oklch(0% 0 0 / 0.08)",
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
              color: "var(--accent-soft-text)",
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
                color: "var(--text)",
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

      <main className="app-main">{children}</main>
    </div>
  );
}
