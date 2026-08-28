// Explicitly loads the monorepo-root .env before anything else runs. This
// must be the FIRST import in every entrypoint (server.ts, jobs-runner) —
// import side effects execute in source order, so importing this before
// ./lib/db.js guarantees DATABASE_URL etc. are set before PrismaClient is
// constructed.
//
// Without this, env vars were only reaching apps/api by accident, as a
// side effect of Prisma's generated client auto-loading .env via the
// packages/db/.env symlink (see packages/db/README.md) — that happened to
// leak every var in the file into process.env, not just DATABASE_URL. This
// makes the dependency explicit instead of relying on that.
import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

const rootEnvPath = fileURLToPath(new URL("../../../.env", import.meta.url));
dotenv.config({ path: path.resolve(rootEnvPath) });
