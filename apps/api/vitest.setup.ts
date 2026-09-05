// Runs before any test file's own imports (see vitest.config.ts's
// setupFiles). Loads the root .env first (same as every entrypoint does
// via src/env.ts — safe to call again, dotenv doesn't overwrite an
// already-set var) since setupFiles run before a test file's own
// `import "../../env.js"` would otherwise populate DATABASE_URL — then
// redirects the whole suite to a separate `<db>_test`
// database so running tests never writes rows into the same interactive
// dev database a browser session might have open at the same time. This
// exists because exactly that happened: running the suite repeatedly
// while manually testing in the browser silently accumulated "Test
// Customer"/"Test job" rows and consumed real invoice numbers in the
// shared dev database.
//
// Skipped in CI (GitHub Actions sets CI=true) — there the whole Postgres
// service container is ephemeral and dedicated to that one job, so
// there's no concurrent interactive session to protect, and no second
// database has been created/migrated for it to redirect to.
import "./src/env.js";

if (!process.env.CI && process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `${url.pathname}_test`;
  process.env.DATABASE_URL = url.toString();
}
