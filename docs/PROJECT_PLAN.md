# Hephaste — Product & Architecture Brief

> **Status note:** this is the original planning brief, kept as the durable
> reference for the product's architecture and roadmap. It describes the
> intended end state — check `README.md`'s Status section for what's
> actually built so far. As of this writing: Phase 0 scaffolding is done
> (see §13 below), the `customers` module is the one fully wired reference
> implementation, and a design system (dashboard, jobs, invoice detail,
> customers, style guide) has been drafted — see the published "Trade
> Platform Design System" artifact and `design/` for the source mockups.
> The product scope has since broadened from trades-only to any
> invoicing/payment-tracking business, via a required onboarding
> questionnaire that sets per-account terminology — see §3a.

## Context

Independent service providers who invoice clients and need to track payment status — trades people, beauticians, artists taking commissions, and similar — currently juggle separate tools, or paper/spreadsheets, with no single place to see "what's outstanding," "what's overdue," or "what needs invoicing." The goal is a single product, `hephaste`, usable across any of these industries, where a business owner can manage their work end-to-end and generate/send/track invoices per piece of work, from either a desktop browser or their phone.

The product started scoped narrowly to trades people; that scope has since broadened to any invoicing/payment-tracking business, with trades, beauty & wellness, and arts/commissions as the initial example verticals it's designed around (see §3a). The underlying domain model didn't need to change for this — only the UI vocabulary a given account sees.

Each account's data must be completely private to them (strict per-account isolation) — the only other actors in the system are internal administrators who support the product itself, not the account holder's work. The repo is a single monorepo containing every part of the system (frontend, backend, database, infra) so one team can build and evolve it as one coherent codebase.

**Decisions already made with the user:**
- **Client**: one responsive React web app, installable as a PWA — no separate native/React Native mobile app.
- **Invoicing scope (v1)**: generate, send, and track invoice status only — no in-app online payment collection (no Stripe in v1).
- **Stack**: Node.js/TypeScript backend, PostgreSQL database.
- **Accounts**: strictly single-user-per-dashboard for v1 (no team/sub-contractor access), but the data model shouldn't be actively hostile to adding that later.

This brief lays out the monorepo structure, domain model, invoice lifecycle, and supporting architecture needed to start building.

---

## 1. Monorepo Structure & Tooling

**pnpm + Turborepo** for workspace management and cached build/lint/test pipelines — enough orchestration for ~6 packages without Nx's overhead.

```
hephaste/
├── apps/
│   ├── api/                  # Node.js/TypeScript backend (REST)
│   │   src/modules/{auth,accounts,customers,jobs,invoices,email,attachments,reporting,admin}/
│   │   src/jobs-runner/      # background job worker
│   │   src/middleware/       # tenant-scoping, error handling
│   │   src/lib/              # pdf generation, s3 client
│   ├── web/                  # React PWA (Vite)
│   │   src/routes/{jobs,invoices,customers,settings,admin}/
│   │   src/pwa/              # manifest, service worker
│   └── admin-web/            # small internal admin UI (optional, see §5)
├── packages/
│   ├── db/                   # Prisma schema + migrations (single source of truth)
│   ├── shared-types/         # Zod schemas + TS types shared FE/BE
│   ├── invoice-engine/       # pure functions: tax/total calc, state machine
│   ├── email-templates/      # invoice email templates
│   ├── pdf/                  # invoice PDF rendering
│   └── config/               # shared eslint/tsconfig
├── infra/
│   ├── docker-compose.yml    # local Postgres, S3-local (MinIO), email sandbox
│   └── terraform/ (or platform-specific config)
├── .github/workflows/{ci,deploy}.yml
├── turbo.json / pnpm-workspace.yaml
```

- TypeScript everywhere, `strict: true`. Node LTS.
- **Vite over Next.js** for `apps/web`: this is an authenticated dashboard, not an SEO/marketing site, so SSR buys nothing — Vite + `vite-plugin-pwa` gives a simpler, faster PWA build.
- `packages/shared-types` is the contract boundary (invoice/job status enums, request/response DTOs) so frontend and backend can never drift on state names.

## 2. ORM: Prisma

Best TypeScript type generation + migration tooling for a small team, expressive enough for nested writes (e.g. "create invoice with line items" in one transaction). Row-Level Security policies (§7) live as hand-written SQL in Prisma migration files since Prisma doesn't manage RLS natively — a known, standard workaround.

## 3. Core Domain Model

Every tenant-owned table carries a non-nullable, indexed `account_id` — this is the single most important invariant in the system.

- **Account** (the tenant/business, not `User` — deliberately named to leave room for a future `AccountMember` join table without renaming FKs): business profile, address, logo, bank details (display-only, no payment processing), VAT number, default tax rate, invoice numbering prefix/sequence, currency.
- **Customer**: belongs to one `account_id`; name/contact/address/notes.
- **Job**: belongs to account + customer; `status` enum (`quoted → scheduled → in_progress → complete`, plus `cancelled`); scheduling window; job-site address; notes.
  - **JobMaterial**: line items of cost feeding into invoices.
  - **Attachment**: photos/files (S3-compatible storage).
- **Invoice**: belongs to account + job (+ denormalized customer) — modeled **one-to-many Job→Invoice** (not unique) so a follow-up/supplementary invoice on the same job is possible later, even though v1 UI only creates one. `status` enum (`draft, sent, viewed, paid, void`) plus a separate `overdue: boolean` flag (see §4 for why these are split), subtotal/tax/total, `amount_paid`, `paid_method` (free text — no processor), PDF URL, timestamps for sent/first-viewed/paid/voided.
- **InvoiceLineItem**: description, type (labour/materials/other), quantity, unit price, stored line total (not recomputed later, for historical accuracy).
- **InvoiceStatusEvent**: append-only audit trail of every status transition (from/to, trigger source, actor, metadata) — never mutate `Invoice.status` without writing one of these in the same transaction.
- **EmailEvent**: one row per email provider webhook event (sent/delivered/opened/bounced), correlated via `provider_message_id`, raw payload retained for debugging.
- **Admin**: entirely separate identity table from `Account` (not a role flag) — see §5.
- **AdminAuditLog**: every admin action against tenant data, logged.

### 3a. Account Onboarding & Terminology

The domain model above is generic enough to serve any invoicing/payment-tracking business — what's industry-specific is purely the words used for it (a trades person's "Job" is a beautician's "Appointment" is an artist's "Commission"). A required, one-time onboarding questionnaire right after account creation (before the dashboard is reachable at all) captures this:

- `Account.industry`: a curated preset (`TRADES`, `BEAUTY`, `ARTS`, `OTHER`) — deliberately stored as a plain validated string, not a Postgres enum, so adding a new industry later is a code-only change (one entry in `industrySchema` + `INDUSTRY_PRESETS`, both in `@hephaste/shared-types`), never a database migration.
- Six label columns (`jobLabelSingular`/`Plural`, `customerLabelSingular`/`Plural`, `assetLabelSingular`/`Plural`) store the *resolved* terminology directly — picking a preset just prefills these before submit, and they stay freely editable afterward (initially only from the onboarding screen; a Settings UI for editing them later is not yet built). "Asset" is the neutral third noun covering a trades person's materials, a beautician's products, or an artist's supplies.
- `Account.onboardingCompletedAt`: `null` until the questionnaire is submitted — the sole gate the web app checks to decide whether to show onboarding instead of the normal dashboard, for any route.

The web app reads these via `useTerminology()` and substitutes them into nav labels and page copy (e.g. "Jobs" nav item, "New job" buttons) instead of hardcoding trade-specific words — see `apps/web/src/account/context.tsx`.

## 4. Invoice Lifecycle

States: `draft → sent → viewed → paid`, `void` reachable from any non-paid state, plus a **separate `overdue` boolean** (not folded into the status enum) flipped by a daily scheduled sweep (`sent`/`viewed` + `due_date` past + not paid/void) and cleared on `paid`/`void`. Splitting these two axes — "how did the customer engage" vs. "is action needed" — avoids a real modeling trap where one enum can't cleanly represent both at once.

| Transition | Trigger |
|---|---|
| → `draft` | User creates invoice from a job |
| `draft` → `sent` | User sends; triggers PDF gen + email (line items lock) |
| `sent` → `viewed` | Resend `email.opened` webhook |
| any → `overdue=true` | Daily scheduled sweep |
| → `paid` | Manual "Mark as Paid" |
| non-paid → `void` | Manual cancel |

Business rules live in `packages/invoice-engine` as pure, heavily unit-tested functions (tax/total math, valid-transition checks) with no DB access — this is the highest financial-correctness-risk code in the product.

## 5. Admin Scope & Isolation

Admins support the *product*, not the account holder's work: view account list/metadata (job/invoice counts, billing status) for support; **cannot** browse an account's customers/jobs/invoice content by default. A "view as account" capability exists only as an explicit, time-boxed, logged break-glass action (`AdminAuditLog`) — the standard SaaS support pattern.

Architecturally: `Admin` is a fully separate auth identity from `Account` (separate Clerk app/instance or a small internal `apps/admin-web`), admin routes never set the tenant RLS session variable, and a separate `admin_service` Postgres role (`BYPASSRLS`) is used only for the logged metadata/impersonation paths — never for normal tenant traffic.

## 6. Feature Scope

**MVP (Phase 1):** account/company profile setup; customer CRUD; job CRUD with status pipeline, scheduling, materials, photo/file attachments; invoice creation from a job with editable line items and tax calc; PDF generation; email send + delivery/open tracking driving status; manual mark-as-paid; overdue detection; dashboard (outstanding total, overdue list, upcoming jobs, completed-but-not-yet-invoiced jobs); PWA installability + responsive layout; minimal admin view.

**Phase 2:** overdue reminder emails, income/outstanding reporting, invoice branding, notification preferences, CSV export, quote/estimate mode, multi-invoice-per-job UI.

**Explicitly deferred (Phase 3+):** online payment collection (Stripe), team/multi-user accounts, offline-first editing, native app, credit notes/refunds, multi-currency.

## 7. Auth & Tenant Isolation

**Auth: Clerk** — rolling your own auth (password hashing, session rotation, verification, resets) is unjustified security surface for a solo/small team; Clerk gives drop-in React components, Node middleware, and (if ever needed) Organizations that map naturally onto a future multi-user `Account`.

**Isolation: layered, not either/or:**
1. **App layer (does the daily work)**: `resolveAccount` middleware verifies the Clerk session and attaches `accountId`; every tenant query goes through a repository layer whose functions require `accountId` as a mandatory first argument (structurally hard to bypass).
2. **DB layer (backstop)**: Postgres Row-Level Security on every tenant table (`USING (account_id = current_setting('app.current_account_id')::uuid)`), set via `SET LOCAL` at the start of each request's transaction; the API's normal DB role has `FORCE ROW LEVEL SECURITY`, so even a forgotten `WHERE` clause can't leak cross-tenant rows.

Dedicated integration tests assert cross-account access is blocked at both layers, and that fetching another account's resource by ID returns 404 (not 403, to avoid confirming existence).

> A local-only `AUTH_MODE=dev` bypass exists (`apps/api/src/lib/devAuth.ts`) purely so the app can be exercised end-to-end without a real Clerk account during development. It's guarded to refuse activating when `NODE_ENV=production` and is not a substitute for the real Clerk flow described above.

## 8. API Design

**REST**, not GraphQL — the domain is small, resource-oriented CRUD with one first-party client; GraphQL's benefits don't pay for themselves here. Zod schemas from `packages/shared-types` validate every request at the route boundary. Route groups: `/api/account`, `/api/customers`, `/api/jobs` (+ `/materials`, `/attachments`, `/status`), `/api/invoices` (+ `/send`, `/mark-paid`, `/void`, `/pdf`), `/api/webhooks/resend`, `/api/dashboard/summary`, `/api/reports`, `/admin/*` (separate middleware, never RLS-scoped to a tenant).

## 9. Email Sending & Tracking

**Resend**: transactional-first deliverability, webhook support (sent/delivered/opened/bounced/complained via Svix-signed events) — the primitives needed to drive `sent`/`viewed` without building custom pixel tracking. Originally scoped as Postmark; switched after Postmark's signup flow rejected a public/free email domain for account creation, blocking sign-up outright before any code here was provider-committal. `EmailEvent` was already provider-agnostic (`provider_message_id`, a generic `EmailEventType` enum), so the switch only touched `apps/api/src/modules/email/webhooks.ts`, its route (`/api/webhooks/resend`), and env var names — not the domain model.

Send flow: sending enqueues a background job (not synchronous in the request) that renders the PDF, uploads it, calls Resend, and records `provider_message_id` (Resend's `email_id`). Inbound webhook handler verifies the Svix signature, is idempotent (dedupe on message id + event type + timestamp), writes `EmailEvent`, and transitions `sent → viewed` on first open. UI should label viewed status as best-effort ("Viewed (estimated)") since pixel-based open tracking is inherently imperfect.

## 10. Background Jobs

Start with a **simple Postgres-backed `BackgroundJob` table** polled by a small worker process (`SELECT ... FOR UPDATE SKIP LOCKED`) rather than Redis/BullMQ — at launch volume (a handful of emails/day per user), a queue service is unjustified infrastructure. Used for: invoice PDF+email send (retryable), daily overdue sweep, phase-2 reminder emails. Upgrade to BullMQ+Redis only if polling latency or job features (priority, rate limiting) become a measured problem.

## 11. Testing & CI

Priority order: (1) `invoice-engine` unit tests (tax math, valid transitions — near-100% coverage, this is where money-trust bugs live); (2) tenant-isolation integration tests against a real Postgres, verifying both the repository layer and RLS itself block cross-account access; (3) invoice lifecycle end-to-end integration tests (job → invoice → send → webhook → status); (4) API contract tests via the shared Zod schemas; (5) a handful of Playwright smoke tests for the critical path only (sign up → customer → job → invoice → send) — broad E2E is too expensive to maintain for a small team.

CI: GitHub Actions, `pnpm install` + `turbo run lint typecheck test --filter=[affected]`, Postgres service container for integration tests, PR preview deploys in place of a dedicated staging environment pre-launch.

## 12. Deployment

Sized small deliberately: managed Postgres with automated backups/PITR (non-negotiable — this holds financial records) on Railway/Render/Neon; `apps/api` + jobs-runner as one or two lightweight services on the same platform; Cloudflare R2 for attachments/PDFs (S3-compatible, no egress fees); `apps/web` static build on Cloudflare Pages/Vercel. AWS/Kubernetes explicitly rejected at this stage — the operational overhead isn't justified until a specific compliance or scale need arises.

## 13. Phased Roadmap

- **Phase 0 (scaffolding)** — ✅ done: monorepo skeleton, full Prisma schema up front (cheap to write once, painful to bolt on piecemeal), Clerk wired in (plus a local dev-auth bypass), CI running on the repo. The `customers` module is the fully wired reference implementation of the tenant-scoped repository pattern; `jobs` and `invoices` are stubs following the same pattern. A design system (dashboard, jobs, invoice detail, customers, style guide) has been drafted and partially implemented in `apps/web`.
- **Phase 1 (MVP)**: build order — account setup → customers → jobs (+ materials/attachments) → invoice creation/line items/tax (engine tests first) → PDF → Resend send + job runner → webhook ingestion → overdue sweep → dashboard → tenant-isolation tests + RLS → PWA polish → minimal admin view.
- **Phase 2**: reminders, reporting, branding, notifications, CSV export, quotes.
- **Phase 3+**: payments, multi-user accounts, offline-first, native app, credit notes/multi-currency — revisit only with real demand.

### Critical files to create first
- `packages/db/schema.prisma` — the domain model and RLS migration anchor point.
- `packages/invoice-engine/src/stateMachine.ts` — transition rules + tax/total math.
- `apps/api/src/middleware/tenantScope.ts` — the entire tenant-isolation guarantee.
- `apps/api/src/modules/email/webhooks.ts` — Resend inbound handler driving status.
- `apps/api/src/jobs-runner/index.ts` — background worker (send, overdue sweep).
- `turbo.json` / `pnpm-workspace.yaml` — the monorepo package graph everything else depends on.

## Verification

Once scaffolded: `pnpm install && docker compose up -d` (local Postgres), `pnpm --filter db prisma migrate dev`, `pnpm dev` to run API + web together, then manually walk the critical path (sign up → create customer → create job → create invoice → send → confirm Resend sandbox delivery → simulate webhook → confirm status flips to `viewed`). CI (`turbo run lint typecheck test`) should pass, with the tenant-isolation and invoice-engine test suites treated as release-blocking from day one.
