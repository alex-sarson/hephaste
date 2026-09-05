import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    // Every integration test file shares one fixed identity (the dev-auth
    // bypass's DEV_ACCOUNT_AUTH_ID — see lib/devAuth.ts) rather than a
    // fresh tenant per file, since there's no way to make resolveAccount
    // pick a different one without a real Clerk token. That single Account
    // row is genuinely shared mutable state (e.g. defaultTaxRate,
    // invoiceNumberPrefix), so running test *files* in parallel (Vitest's
    // default) races: a profile-update test in one file was observed
    // flipping defaultTaxRate mid-run and breaking an unrelated invoice
    // total assertion in another. Sequential file execution is the correct
    // fix given that shared-identity design, not a workaround for it.
    fileParallelism: false,
  },
});
