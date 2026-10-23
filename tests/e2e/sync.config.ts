import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
const port = Number(process.env.NOTDOWN_SYNC_E2E_PORT || 4368);
export default defineConfig({
  testDir: ".", testMatch: "sync.spec.ts", workers: 1, timeout: 120000,
  expect: { timeout: 15000 }, outputDir: "../../test-results/sync",
  reporter: [["list"], ["html", { outputFolder: "test-results/sync-report", open: "never" }]],
  use: { ...devices["Desktop Chrome"], channel: "chrome", headless: true, baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: { command: "node --import tsx tests/e2e/sync-server.ts", url: `http://127.0.0.1:${port}/__sync-test/context`,
    cwd: path.resolve(import.meta.dirname, "../.."), reuseExistingServer: false, timeout: 60000, gracefulShutdown: { signal: "SIGTERM", timeout: 10000 } },
});
