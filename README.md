# Trade Platform

A monorepo for trades people to track jobs and process invoicing — a
responsive web app (installable as a PWA) backed by a Node.js/TypeScript API
and PostgreSQL, with strict per-account data isolation.

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
  docker-compose.yml  Local Postgres + MinIO (S3-compatible)
```

## Local setup

Requires Node 22+, pnpm (`corepack enable`), and Docker.

```bash
cp .env.example .env          # fill in Clerk/Postmark keys as you get them
docker compose -f infra/docker-compose.yml up -d
pnpm install
pnpm db:migrate                # applies the Prisma schema
pnpm db:generate
pnpm dev                        # runs api + web together (turbo --parallel)
```

- Web: http://localhost:5173
- API: http://localhost:3001 (health check at `/health`)

## Status

Phase 0 (scaffolding) — see the brief's §13 roadmap. The `customers` module
in `apps/api/src/modules/customers` is a fully wired reference
implementation of the tenant-scoped repository pattern (brief §7.2); `jobs`
and `invoices` are stubs following the same pattern, to be filled in during
Phase 1.

## License

All rights reserved. This code is public for reference only — no license
is granted to use, copy, modify, or distribute it without prior written
permission. See [LICENSE](./LICENSE).
