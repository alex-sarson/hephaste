import "./env.js";
// Must be imported before any express.Router() is constructed (i.e. before
// the route module imports below) — it patches Express 4's router
// internals so a throw/rejection inside an `async` handler reaches
// errorHandler instead of hanging the request until client timeout.
import "express-async-errors";
import express from "express";
import cors from "cors";
import { accountRouter } from "./modules/account/router.js";
import { customersRouter } from "./modules/customers/router.js";
import { jobsRouter } from "./modules/jobs/router.js";
import { invoicesRouter } from "./modules/invoices/router.js";
import { dashboardRouter } from "./modules/dashboard/router.js";
import { adminRouter } from "./modules/admin/router.js";
import { handleResendWebhook } from "./modules/email/webhooks.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(cors());
// `verify` stashes the exact raw bytes on every request as req.rawBody —
// only modules/email/webhooks.ts uses it (Svix signature verification
// needs the exact bytes that were signed, not a reparsed/restringified
// version of req.body), but capturing it here for every request is
// simpler and cheaper than giving that one route its own body parser
// ahead of this global one (which would otherwise have already drained
// the request stream).
app.use(
  express.json({
    // body-parser types `verify`'s req as the raw http.IncomingMessage
    // (not Express's augmented Request), hence the cast.
    verify: (req, _res, buf) => {
      (req as express.Request).rawBody = buf;
    },
  }),
);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Tenant-facing routes — each router applies resolveAccount itself.
app.use("/api/account", accountRouter);
app.use("/api/customers", customersRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/invoices", invoicesRouter);
app.use("/api/dashboard", dashboardRouter);

// Inbound provider webhook — no tenant session, see webhooks.ts.
app.post("/api/webhooks/resend", handleResendWebhook);

// Admin routes — separate auth path, never RLS-scoped to a tenant. See
// brief §5.3 and middleware/requireAdmin.ts.
app.use("/admin", adminRouter);

// Must be registered last.
app.use(errorHandler);

const port = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
