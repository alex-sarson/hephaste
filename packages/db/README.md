# @hephaste/db

Single source of truth for the domain model. Every other package/app depends on
this one for types and the Prisma client — see the root brief, §2 and §3.

## Local setup

```bash
# from repo root, with infra/docker-compose.yml's postgres service running
cp .env.example .env   # if not already done at repo root
pnpm db:migrate         # runs `prisma migrate dev`, creates/updates local schema
pnpm db:generate         # regenerates the Prisma client into generated/client
pnpm --filter @hephaste/db seed
```

`.env` needs **two** connection strings, not one — see the next section for
why: `DATABASE_URL` (the owner/migration role) and `APP_DATABASE_URL` (the
app's runtime role, created by the migration below the first time it runs).

## Row-Level Security (RLS)

Implemented in `prisma/migrations/20260912120000_add_row_level_security/`.
Prisma doesn't manage RLS policies natively, so — as originally planned here
— it's hand-written SQL in its own migration rather than anything expressed
in `schema.prisma`, added once the base tables already existed.

What it actually does, and why it's two roles rather than one:

- A Postgres table's **owner** always bypasses RLS, full stop — `FORCE ROW
  LEVEL SECURITY` doesn't change that, it only closes the gap for
  non-owners. Since the existing migration role (`hephaste` locally) owns
  every table it creates, the app can't keep connecting as that role for
  normal tenant traffic and expect RLS to mean anything.
- The migration creates a second, non-owner login role — `hephaste_app` —
  with plain `SELECT/INSERT/UPDATE/DELETE` grants and nothing else. This is
  who `APP_DATABASE_URL` points at, and it's the connection every
  tenant-scoped request actually runs on
  (`apps/api/src/lib/db.ts`'s `prisma` export, wired up per-request by
  `apps/api/src/middleware/tenantScope.ts`'s `resolveAccount`).
- One identical `tenant_isolation` policy per tenant table — `customers`,
  `jobs`, `job_notes`, `job_materials`, `attachments`, `invoices`,
  `invoice_line_items`, `invoice_status_events`, `email_events`,
  `background_jobs` — both `USING` and `WITH CHECK`, comparing
  `account_id` against `current_setting('app.current_account_id', true)`
  (no `::uuid` cast — the columns are plain `text`, not the native
  Postgres `uuid` type, and `text = uuid` has no operator). `true`
  (missing_ok) means an un-scoped transaction gets `NULL`, which matches
  nothing — fail closed, not fail open.
- `background_jobs.account_id` is nullable (scheduled sweeps aren't
  account-scoped — see `schema.prisma`), and a `NULL` row never matches
  the policy either. The queue processor
  (`apps/api/src/jobs-runner/index.ts`) genuinely needs to see every
  account's jobs (and the accountless sweep ones) in one query, so it —
  and the overdue sweep, which is the same kind of cross-tenant system
  operation — runs via `lib/db.ts`'s `privilegedPrisma` instead, which
  reuses the existing owner role rather than provisioning a third one.
  That role is still bypass-everything, so treat it the way the brief's
  `admin_service`/`BYPASSRLS` role is treated elsewhere: never for
  anything driven by a single request's `accountId`. A dedicated
  `admin_service` role (brief §5) is still a follow-up for once the admin
  module actually needs cross-account **content** access, not just the
  `accounts` metadata listing it has today (which needs no bypass —
  `accounts` itself carries no RLS policy at all; it's the tenant
  boundary, not tenant content).

Local sanity check that the backstop actually backstops something — connect
directly as the app role and confirm an unscoped query sees nothing, then
see everything once scoped:

```bash
psql "$APP_DATABASE_URL" -c "SELECT count(*) FROM jobs;"                      # 0
psql "$APP_DATABASE_URL" -c "BEGIN; SET LOCAL app.current_account_id = '<uuid>'; SELECT count(*) FROM jobs; COMMIT;"
```
