// Runs a local Postgres cluster for `pnpm dev` (see scripts/dev.mjs). Kept
// as its own process rather than imported into dev.mjs because
// embedded-postgres registers its own SIGINT/SIGTERM exit hook at import
// time that calls process.exit() — which would race dev.mjs's own ordered
// shutdown (API and web first, then storage and Postgres last).
//
// Contract with dev.mjs: config arrives via PG_* env vars, `{ ready: true }`
// is sent over the IPC channel once every database in PG_DATABASES exists,
// and the cluster is stopped on SIGTERM/SIGINT (embedded-postgres's own
// hook) or when the parent goes away (IPC disconnect).
import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const { PG_DIR, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASES } = process.env;

const pg = new EmbeddedPostgres({
  databaseDir: PG_DIR,
  user: PG_USER,
  password: PG_PASSWORD,
  port: Number(PG_PORT),
  persistent: true,
});

if (!existsSync(path.join(PG_DIR, "PG_VERSION"))) {
  await pg.initialise();
}
await pg.start();

for (const name of PG_DATABASES.split(",").filter(Boolean)) {
  try {
    await pg.createDatabase(name);
  } catch (err) {
    // Persistent data dir: every start after the first finds them already there.
    if (!/already exists/i.test(String(err?.message ?? err))) throw err;
  }
}

process.on("disconnect", async () => {
  await pg.stop();
  process.exit(0);
});

process.send?.({ ready: true });
