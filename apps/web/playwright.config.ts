import { defineConfig } from "@playwright/test";

// Minimal Playwright config for this repo's first browser-test suite.
// Points at an already-running dev server (see README/CLAUDE.md "cd apps/web
// && npm run dev") rather than starting its own, since the API server
// (api/cmd/server) must also already be running for login to work and this
// config has no way to orchestrate that second process.
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: false,
  // Single worker, deliberately: this suite hits a locally-running,
  // single-instance Go dev server (api/cmd/server), not a scaled backend.
  // Multiple Playwright workers hammering it concurrently produced
  // intermittent 500s on unrelated endpoints (confirmed via repeated direct
  // curl calls returning 200 in isolation) - a local dev-server concurrency
  // artifact, not a real application bug, and not something this
  // layout-only task should paper over by loosening the error assertions.
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    screenshot: "only-on-failure",
  },
});
