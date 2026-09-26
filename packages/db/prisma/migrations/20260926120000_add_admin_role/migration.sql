-- The role the admin console's API handlers connect as (brief §5.3):
-- ADMIN_DATABASE_URL, used only via lib/db.ts's adminPrisma(). It exists so
-- admin code never has to run as the table-owning superuser just to count
-- rows across tenants.
--
-- BYPASSRLS is what lets it read across accounts (the tenant_isolation
-- policies would otherwise hide every row from it). What keeps that from
-- being a skeleton key is the GRANTs below: it is limited to the columns
-- the metadata-only admin views need. It has no privilege at all on
-- customer/job/invoice CONTENT (names, titles, descriptions, notes,
-- amounts, addresses, ...), on attachments, notes, materials, line items or
-- email events — a bug or injection in an admin handler cannot read what the
-- role was never granted. "Admins can't normally see tenant content"
-- (brief §5) is therefore enforced by Postgres, not just by code review.
--
-- Same provisioning caveat as hephaste_app (see the add_row_level_security
-- migration): the dev-only password below is for local/CI. BYPASSRLS can
-- only be granted by a superuser, so a real deployed environment should
-- create this role out-of-band (with a generated secret) before running
-- this migration; the IF NOT EXISTS then leaves it alone.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'hephaste_admin') THEN
    CREATE ROLE hephaste_admin WITH LOGIN PASSWORD 'hephaste_admin' BYPASSRLS;
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO hephaste_admin', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO hephaste_admin;

-- Read: metadata columns only.
GRANT SELECT (id, business_name, contact_email, industry, currency, created_at, deleted_at)
  ON accounts TO hephaste_admin;
GRANT SELECT (id, account_id, deleted_at) ON customers TO hephaste_admin;
GRANT SELECT (id, account_id, status, deleted_at) ON jobs TO hephaste_admin;
GRANT SELECT (id, account_id, invoice_number, status, overdue, sent_at, created_at)
  ON invoices TO hephaste_admin;
GRANT SELECT (id, email, role) ON admins TO hephaste_admin;

-- The job queue and the audit trail hold no tenant content: queue rows are
-- {type, status, payload: {invoiceId}, lastError}, needed to tell whether an
-- invoice email failed and to enqueue a retry.
GRANT SELECT, INSERT ON background_jobs TO hephaste_admin;
GRANT SELECT, INSERT ON admin_audit_logs TO hephaste_admin;
