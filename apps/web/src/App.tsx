import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { DashboardPage } from "./routes/DashboardPage.js";
import { JobsPage } from "./routes/JobsPage.js";
import { InvoicesPage } from "./routes/InvoicesPage.js";
import { CustomersPage } from "./routes/CustomersPage.js";
import { SettingsPage } from "./routes/SettingsPage.js";

export function App() {
  return (
    <BrowserRouter>
      <SignedOut>
        <div style={{ padding: 24 }}>
          <h1>Trade Platform</h1>
          <p>Sign in to view your dashboard.</p>
          <SignInButton mode="modal" />
        </div>
      </SignedOut>
      <SignedIn>
        <header style={{ display: "flex", justifyContent: "space-between", padding: 16 }}>
          <nav style={{ display: "flex", gap: 16 }}>
            <Link to="/">Dashboard</Link>
            <Link to="/jobs">Jobs</Link>
            <Link to="/invoices">Invoices</Link>
            <Link to="/customers">Customers</Link>
            <Link to="/settings">Settings</Link>
          </nav>
          <UserButton />
        </header>
        <main style={{ padding: 16 }}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </SignedIn>
    </BrowserRouter>
  );
}
