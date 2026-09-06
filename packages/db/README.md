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

## Row-Level Security (RLS)

Prisma does not manage RLS policies natively, so they are **not** expressed in
`schema.prisma`. After the first `prisma migrate dev` has created the tables,
add a follow-up migration (`prisma migrate dev --create-only --name add_rls`)
whose SQL enables RLS and adds one policy per tenant table, e.g.:

```sql
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON customers
  USING (account_id = current_setting('app.current_account_id', true)::uuid);

-- Repeat for: jobs, job_notes, job_materials, attachments, invoices,
-- invoice_line_items, invoice_status_events, email_events, background_jobs.
```

The application's normal Postgres role must have `FORCE ROW LEVEL SECURITY`
applied (above) so even that role can't bypass its own policies. Only a
separate `admin_service` role (used exclusively by the admin module) is
granted `BYPASSRLS`, and every query made through that role must be logged to
`admin_audit_logs`. See the root brief §5 and §7, and
`apps/api/src/middleware/tenantScope.ts`.

This migration is intentionally not included in Phase 0 scaffolding — write
it once the initial `migrate dev` has run against a real database, since
Prisma's migration diffing needs the base tables to exist first.
