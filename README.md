# Hephaste

A monorepo for tracking jobs and processing invoicing for any business that
bills clients — trades people, beauticians, artists taking commissions, and
similar — a responsive web app (installable as a PWA) backed by a
Node.js/TypeScript API and PostgreSQL, with strict per-account data
isolation. A required onboarding questionnaire sets each account's
terminology (e.g. "Job" vs. "Appointment" vs. "Commission") — see
`docs/PROJECT_PLAN.md` §3a.

See [`docs/PROJECT_PLAN.md`](./docs/PROJECT_PLAN.md) for the full
product/architecture brief behind every decision below: domain model,
invoice lifecycle, auth & tenant isolation, email tracking, deployment, and
the phased roadmap.

## Repo layout

```
apps/
  api/        Node.js/TypeScript backend (REST) + background jobs-runner
  web/        React PWA (Vite) — the only client; no separate native app
packages/
  db/               Prisma schema + migrations (single source of truth)
  shared-types/     Zod schemas + TS types shared between api and web
  invoice-engine/   Pure functions: tax/total math, invoice state machine
  email-templates/  Invoice email templates (Phase 1)
  pdf/              Invoice PDF rendering (Phase 1)
  config/           Shared eslint/tsconfig
infra/
  docker-compose.yml  Optional: Postgres + SeaweedFS (S3-compatible) in containers
scripts/
  dev.mjs             `pnpm dev` — starts the whole local stack (see below)
```

## Local setup

Requires Node 22+ and pnpm (`corepack enable`). No Docker needed.

```bash
pnpm install
pnpm dev
```

`pnpm dev` is the whole stack from one command: Postgres, S3-compatible
object storage, database migrations, the API, the jobs-runner and the web
app. On first run it also creates `.env` from `.env.example` with
`AUTH_MODE=dev` (a stub sign-in, so no Clerk account is needed — add real
Clerk/Resend keys to `.env` when you want them). Ctrl+C stops everything.

- Web: http://localhost:5173
- API: http://localhost:3001 (health check at `/health`)

What it starts, and where the state lives (`.dev/`, gitignored — delete the
folder to reset to a blank slate):

- **Postgres 16** on the port in `DATABASE_URL`, via the `embedded-postgres`
  npm package (real PostgreSQL binaries, so row-level security behaves as in
  production). It also creates and migrates the `<db>_test` database that
  `pnpm test` uses.
- **SeaweedFS** (`weed mini`, Apache-2.0) on the port in `S3_ENDPOINT`, with
  the bucket and credentials from `.env`. The pinned release is downloaded
  once into `.dev/bin` and checksum-verified. (MinIO, used previously, was
  archived upstream in April 2026 with no further releases.)

If something is already listening on those ports — the docker compose file
in `infra/`, a system Postgres — `pnpm dev` uses it as-is instead and leaves
it running on exit. To run just the apps against infrastructure you manage
yourself, use `pnpm dev:apps`.

## Status

Phase 1 (MVP) is feature-complete — see the brief's §13 roadmap: customers,
jobs (materials, attachments), invoices (line items, tax, PDF, email send and
delivery tracking, overdue detection), the dashboard, the required industry
onboarding questionnaire (brief §3a), Postgres row-level security, the PWA,
and a minimal admin console at `/admin` (account list, per-account summary,
audit log, invoice-email retry). Phase 2 and the accounting phase are next.

## License

All rights reserved. This code is public for reference only — no license
is granted to use, copy, modify, or distribute it without prior written
permission. See [LICENSE](./LICENSE).
