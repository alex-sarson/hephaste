#!/usr/bin/env node
// `pnpm dev` — brings up the whole local stack from one command:
//
//   Postgres  →  S3-compatible object storage  →  migrations  →  API +
//   jobs-runner + web (`pnpm dev:apps`, i.e. turbo)
//
// and tears it all down again, in reverse order, on Ctrl+C.
//
// Postgres and object storage are each "use it if it's already there,
// otherwise start a managed copy": if DATABASE_URL / S3_ENDPOINT already
// answer (docker compose from infra/, a system Postgres, a previous
// `pnpm dev` that was killed hard), that is used as-is and left alone on
// exit. Otherwise — and only when the URL points at localhost — a copy is
// started under .dev/ (gitignored):
//
//   - Postgres: the real PostgreSQL 16 binaries via the `embedded-postgres`
//     npm package (scripts/dev-postgres.mjs), so RLS behaves exactly as in
//     production. No Docker needed.
//   - Object storage: SeaweedFS (Apache-2.0) — `weed mini`, a single
//     process with an S3 API. The pinned release binary is downloaded once
//     into .dev/bin and md5-verified. It replaces MinIO, whose repository
//     was archived in April 2026 with no further releases.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const devDir = path.join(root, ".dev");
const logDir = path.join(devDir, "logs");

// Bump together with the md5s below (the release publishes a `.md5` next to
// each archive: .../releases/download/<version>/<asset>.tar.gz.md5).
const SEAWEEDFS_VERSION = "4.47";
const SEAWEEDFS_ASSETS = {
  "linux-x64": {
    asset: "linux_amd64",
    md5: "d327aa9fc73bfa7861fe3be4a4e9ebb7",
  },
  "linux-arm64": {
    asset: "linux_arm64",
    md5: "a3e61f0c680039720fb7372ab7b0fd1a",
  },
  "darwin-x64": {
    asset: "darwin_amd64",
    md5: "bb67d2cf0646a79dadd65764cbb2ac6b",
  },
  "darwin-arm64": {
    asset: "darwin_arm64",
    md5: "1a005a70ed013b3503a54b7c7833423f",
  },
};

const log = (msg) => console.log(`[dev] ${msg}`);

function die(msg, logFile) {
  console.error(`\n[dev] ${msg}`);
  if (logFile && existsSync(logFile)) {
    const tail = readFileSync(logFile, "utf8")
      .trimEnd()
      .split("\n")
      .slice(-20)
      .join("\n");
    console.error(
      `[dev] last lines of ${path.relative(root, logFile)}:\n${tail}`,
    );
  }
  return cleanup().then(() => process.exit(1));
}

// ---------------------------------------------------------------- env ---

const envPath = path.join(root, ".env");
if (!existsSync(envPath)) {
  // First run on a fresh clone: no Clerk keys exist yet, so default the copy
  // to the dev-auth bypass (apps/api/src/lib/devAuth.ts) so the app is
  // actually usable straight away.
  const seeded = readFileSync(path.join(root, ".env.example"), "utf8")
    .replace(/^AUTH_MODE=$/m, "AUTH_MODE=dev")
    .replace(/^VITE_AUTH_MODE=$/m, "VITE_AUTH_MODE=dev");
  writeFileSync(envPath, seeded);
  log(
    "no .env found — created one from .env.example with AUTH_MODE=dev (no Clerk keys needed)",
  );
}
process.loadEnvFile(envPath);

for (const key of [
  "DATABASE_URL",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET",
]) {
  if (!process.env[key]) {
    console.error(`[dev] ${key} is not set in .env — see .env.example`);
    process.exit(1);
  }
}

// ------------------------------------------------------------ helpers ---

function probe(target, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = net.connect(target);
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

async function waitFor(check, timeoutMs, description) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for ${description}`);
}

const isLocalHost = (hostname) =>
  ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);

function openLog(name) {
  mkdirSync(logDir, { recursive: true });
  const file = path.join(logDir, name);
  return { file, fd: openSync(file, "a") };
}

function stopChild(child, timeoutMs) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

// Set once the apps are running; until then a signal just unwinds startup.
let apps;
let interrupted = 0;
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    if (++interrupted > 1) {
      log("second interrupt — not waiting for a clean shutdown");
      process.exit(1);
    }
    if (!apps) {
      cleanup().then(() => process.exit(130));
    } else if (signal !== "SIGINT") {
      // A terminal Ctrl+C already reached turbo (same process group); a plain
      // `kill <pid>` of this script did not, so pass those on.
      apps.kill("SIGTERM");
    }
  });
}

// Everything that has to be stopped again, most-recently-started last.
const stops = [];
let cleaningUp;
function cleanup() {
  cleaningUp ??= (async () => {
    for (const stop of stops.reverse()) await stop();
  })();
  return cleaningUp;
}

// ----------------------------------------------------------- postgres ---

async function ensurePostgres() {
  const url = new URL(process.env.DATABASE_URL);
  const port = Number(url.port || 5432);
  const socketDir = url.searchParams.get("host");
  const target = socketDir?.startsWith("/")
    ? { path: path.join(socketDir, `.s.PGSQL.${port}`) }
    : { host: url.hostname, port };

  if (await probe(target)) {
    log(`Postgres already running (${url.hostname}:${port}) — using it`);
    return { managed: false };
  }
  if (!isLocalHost(url.hostname) || socketDir) {
    await die(
      `Postgres is not reachable at DATABASE_URL, and it isn't a plain localhost TCP URL, ` +
        `so it can't be started for you. Start it yourself, or point DATABASE_URL at ` +
        `postgresql://<user>:<password>@localhost:<port>/<db> to have \`pnpm dev\` manage one.`,
    );
  }

  log(`starting Postgres 16 on :${port} (data in .dev/postgres)…`);
  const { file, fd } = openLog("postgres.log");
  const dbName = url.pathname.slice(1);
  const child = spawn(process.execPath, [path.join(here, "dev-postgres.mjs")], {
    cwd: root,
    // Own process group: a terminal Ctrl+C must not stop the database while
    // the API is still shutting down; cleanup() stops it last.
    detached: true,
    stdio: ["ignore", fd, fd, "ipc"],
    env: {
      ...process.env,
      PG_DIR: path.join(devDir, "postgres"),
      PG_PORT: String(port),
      PG_USER: decodeURIComponent(url.username || "postgres"),
      PG_PASSWORD: decodeURIComponent(url.password || "postgres"),
      // The test database is what `pnpm test` runs against (see
      // apps/api/vitest.setup.ts).
      PG_DATABASES: `${dbName},${dbName}_test`,
    },
  });
  closeSync(fd);
  stops.push(() => stopChild(child, 20_000));

  try {
    await new Promise((resolve, reject) => {
      child.once("message", (m) => m?.ready && resolve());
      child.once("exit", (code) =>
        reject(new Error(`exited with code ${code}`)),
      );
      setTimeout(
        () => reject(new Error("timed out after 120s")),
        120_000,
      ).unref();
    });
  } catch (err) {
    await die(`Postgres failed to start: ${err.message}`, file);
  }
  return { managed: true, dbName };
}

function migrate(databaseUrl, label) {
  const env = { ...process.env, DATABASE_URL: databaseUrl };
  const result = spawnSync(
    "pnpm",
    ["--filter", "@hephaste/db", "migrate:deploy"],
    {
      cwd: root,
      env,
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    console.error(result.stdout, result.stderr);
    return die(`applying migrations to ${label} failed (output above)`);
  }
}

// ------------------------------------------------------------- storage ---

async function ensureSeaweedBinary() {
  const key = `${process.platform}-${process.arch}`;
  const entry = SEAWEEDFS_ASSETS[key];
  if (!entry) {
    await die(
      `no SeaweedFS build for ${key}. Run any S3-compatible server yourself and point ` +
        `S3_ENDPOINT at it, or use \`docker compose -f infra/docker-compose.yml up -d\`.`,
    );
  }
  const bin = path.join(devDir, "bin", `weed-${SEAWEEDFS_VERSION}`);
  if (existsSync(bin)) return bin;

  const url = `https://github.com/seaweedfs/seaweedfs/releases/download/${SEAWEEDFS_VERSION}/${entry.asset}.tar.gz`;
  log(`downloading SeaweedFS ${SEAWEEDFS_VERSION} (one-time, ~45MB)…`);
  mkdirSync(path.dirname(bin), { recursive: true });
  const archive = `${bin}.tar.gz`;
  const extractDir = `${bin}.extract`;
  try {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} from ${url}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(archive));
    const md5 = createHash("md5").update(readFileSync(archive)).digest("hex");
    if (md5 !== entry.md5)
      throw new Error(`md5 mismatch: expected ${entry.md5}, got ${md5}`);
    mkdirSync(extractDir, { recursive: true });
    const tar = spawnSync("tar", ["-xzf", archive, "-C", extractDir], {
      encoding: "utf8",
    });
    if (tar.status !== 0) throw new Error(`tar failed: ${tar.stderr}`);
    renameSync(path.join(extractDir, "weed"), bin);
    chmodSync(bin, 0o755);
  } catch (err) {
    await die(`could not fetch SeaweedFS: ${err.message}`);
  } finally {
    rmSync(archive, { force: true });
    rmSync(extractDir, { recursive: true, force: true });
  }
  return bin;
}

async function ensureStorage() {
  const endpoint = new URL(process.env.S3_ENDPOINT);
  const port = Number(endpoint.port || 80);

  if (await probe({ host: endpoint.hostname, port })) {
    log(`S3 endpoint already running (${endpoint.host}) — using it`);
    return;
  }
  if (!isLocalHost(endpoint.hostname)) {
    await die(
      `S3_ENDPOINT (${endpoint.host}) is not reachable and isn't localhost, so it can't be started for you.`,
    );
  }

  const bin = await ensureSeaweedBinary();
  log(`starting SeaweedFS S3 on :${port} (data in .dev/seaweedfs)…`);
  const { file, fd } = openLog("seaweedfs.log");
  const dataDir = path.join(devDir, "seaweedfs");
  mkdirSync(dataDir, { recursive: true });
  const child = spawn(
    bin,
    [
      "mini",
      `-dir=${dataDir}`,
      // Loopback only — the dev credentials are well-known, so don't offer
      // them to the LAN.
      "-ip=127.0.0.1",
      "-ip.bind=127.0.0.1",
      `-s3.port=${port}`,
      "-webdav=false",
      "-admin.ui=false",
    ],
    {
      cwd: devDir,
      detached: true, // same reasoning as Postgres above
      stdio: ["ignore", fd, fd],
      env: {
        ...process.env,
        // `weed mini` seeds its single admin identity and the bucket from
        // these — the same names any AWS SDK reads.
        AWS_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
        S3_BUCKET: process.env.S3_BUCKET,
      },
    },
  );
  closeSync(fd);
  stops.push(() => stopChild(child, 10_000));

  let exited = false;
  child.once("exit", () => (exited = true));
  try {
    await waitFor(
      () => {
        if (exited) throw new Error("process exited");
        return readFileSync(file, "utf8").includes(
          "All enabled components are running and ready",
        );
      },
      60_000,
      "SeaweedFS to report ready",
    );
  } catch (err) {
    await die(`SeaweedFS failed to start: ${err.message}`, file);
  }
}

// ---------------------------------------------------------------- main ---

const postgres = await ensurePostgres();
await ensureStorage();

if (!existsSync(path.join(root, "packages/db/generated/client"))) {
  log("generating Prisma client…");
  const gen = spawnSync("pnpm", ["db:generate"], {
    cwd: root,
    encoding: "utf8",
  });
  if (gen.status !== 0) {
    console.error(gen.stdout, gen.stderr);
    await die("prisma generate failed (output above)");
  }
}

log("applying database migrations…");
await migrate(process.env.DATABASE_URL, "the dev database");
if (postgres.managed) {
  // Only the database we created ourselves is known to have a sibling test
  // database; for an external Postgres that's the operator's business.
  const testUrl = new URL(process.env.DATABASE_URL);
  testUrl.pathname = `${testUrl.pathname}_test`;
  await migrate(testUrl.toString(), "the test database");
}

log("ready — starting API, jobs-runner and web");
log(`  web  http://localhost:5173`);
log(`  api  http://localhost:${process.env.PORT ?? 3001}`);

apps = spawn("pnpm", ["run", "dev:apps"], { cwd: root, stdio: "inherit" });

apps.once("exit", async (code) => {
  log("stopping storage and database…");
  await cleanup();
  process.exit(interrupted ? 0 : (code ?? 1));
});
