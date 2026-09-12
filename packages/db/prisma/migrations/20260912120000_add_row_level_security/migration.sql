-- Row-Level Security (brief §7) — the DB-layer backstop behind the
-- app-layer accountId scoping every repository function already enforces.
-- See packages/db/README.md's "Row-Level Security" section and
-- apps/api/src/lib/db.ts's withTenantScope/privilegedPrisma.
--
-- Two Postgres roles, not one:
--   - the role this migration runs as (the existing owner/migration role,
--     superuser locally) keeps creating and owning every table. A table's
--     OWNER always bypasses RLS regardless of FORCE ROW LEVEL SECURITY, so
--     the app must never connect as the owner for normal tenant traffic —
--     it stays available only as a privileged, RLS-bypassing connection
--     for genuinely cross-tenant system code (the overdue sweep,
--     background-job queue processing, future admin cross-account
--     queries — see lib/db.ts's privilegedPrisma). Never for anything
--     driven by a single request's accountId.
--   - hephaste_app (created below) is a plain, non-owner login role with
--     only DML grants. This is what the running API actually connects as
--     for anything routed through withTenantScope — see APP_DATABASE_URL
--     in .env.example — and is the role FORCE ROW LEVEL SECURITY actually
--     has teeth against.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'hephaste_app') THEN
    -- Dev-only password, checked into source control on purpose (matches
    -- infra/docker-compose.yml's plaintext local credentials). A real
    -- deployed environment must provision this role out-of-band with a
    -- generated secret before this migration runs there — never rely on
    -- this literal outside local dev/CI.
    CREATE ROLE hephaste_app WITH LOGIN PASSWORD 'hephaste_app';
  END IF;
END
$$;

-- GRANT ... ON DATABASE needs a literal identifier, and the database name
-- differs between the dev DB and the vitest-only "_test" one this same
-- migration also runs against — current_database() keeps it working
-- either way without hardcoding a name here.
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO hephaste_app', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO hephaste_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hephaste_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hephaste_app;

-- So a table added by a LATER migration (still run as the owner role) is
-- automatically granted to hephaste_app too, without a follow-up
-- migration every time the schema grows.
ALTER DEFAULT PRIVILEGES FOR ROLE hephaste IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hephaste_app;
ALTER DEFAULT PRIVILEGES FOR ROLE hephaste IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO hephaste_app;

-- One identical tenant_isolation policy per tenant table.
--
-- current_setting(..., true) (missing_ok) returns NULL rather than
-- erroring when app.current_account_id was never SET LOCAL for the
-- current transaction (see withTenantScope) — and `NULL = anything` is
-- never true, so a transaction that forgot to scope itself sees (and can
-- write) NOTHING under this role, rather than everything. That's the
-- actual backstop: even a forgotten accountId filter in application code
-- fails closed here instead of leaking cross-tenant rows.
--
-- WITH CHECK closes the write side of the same gap: a request can't
-- INSERT/UPDATE a row stamped with some OTHER account's id, even if the
-- application code building that row got its own accountId argument
-- wrong.
--
-- background_jobs.account_id is nullable (scheduled sweeps aren't
-- account-scoped — see schema.prisma) — a NULL row never matches this
-- policy either, by the same NULL-comparison logic above, so the queue
-- processor (claimNextJob, detectOverdue, maybeScheduleOverdueSweep) must
-- run via privilegedPrisma to see/write those rows at all. That's
-- intentional: it's a genuinely cross-tenant system table, not tenant
-- content.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers', 'jobs', 'job_notes', 'job_materials', 'attachments',
    'invoices', 'invoice_line_items', 'invoice_status_events',
    'email_events', 'background_jobs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (account_id = current_setting(''app.current_account_id'', true)) WITH CHECK (account_id = current_setting(''app.current_account_id'', true))',
      t
    );
  END LOOP;
END
$$;
