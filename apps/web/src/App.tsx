import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SignInButton } from "@clerk/clerk-react";
import { useAuthToken } from "./auth/context.js";
import { useAccount } from "./account/context.js";
import { AppShell } from "./components/AppShell.js";
import { BrandMark } from "./components/icons.js";
import { DashboardPage } from "./routes/DashboardPage.js";
import { JobsPage } from "./routes/JobsPage.js";
import { InvoicesPage } from "./routes/InvoicesPage.js";
import { CustomersPage } from "./routes/CustomersPage.js";
import { SettingsPage } from "./routes/SettingsPage.js";
import { OnboardingPage } from "./routes/OnboardingPage.js";

function SignedOutScreen() {
  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: "var(--accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <BrandMark width={22} height={22} />
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22 }}>Trade Platform</div>
        <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginTop: 6 }}>
          Sign in to view your dashboard.
        </p>
      </div>
      <SignInButton mode="modal">
        <button className="btn-primary">Sign in</button>
      </SignInButton>
    </div>
  );
}

export function App() {
  const { isSignedIn } = useAuthToken();
  const { account, loading } = useAccount();

  // Required gate (brief §3a): until onboardingCompletedAt is set, every
  // path shows the onboarding questionnaire instead of the normal app —
  // checked before rendering any Route so there's no way to deep-link
  // around it.
  const needsOnboarding = isSignedIn && !loading && account && account.onboardingCompletedAt === null;

  return (
    <BrowserRouter>
      {!isSignedIn && <SignedOutScreen />}
      {isSignedIn && loading && <div style={{ minHeight: "100%", background: "var(--bg)" }} />}
      {isSignedIn && !loading && needsOnboarding && <OnboardingPage />}
      {isSignedIn && !loading && !needsOnboarding && (
        <AppShell>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </AppShell>
      )}
    </BrowserRouter>
  );
}
