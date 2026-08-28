import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
      <div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 26, letterSpacing: "-0.01em" }}>
          {title}
        </div>
        {subtitle && <div style={{ fontSize: 13.5, color: "var(--text-muted)", marginTop: 4 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}
