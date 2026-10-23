import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
const port = Number(process.env.NOTDOWN_MOBILE_E2E_PORT || 4347);
export default defineConfig({
  testDir: ".", testMatch: "mobile.spec.ts", workers: 1, timeout: 45000,
  expect: { timeout: 10000 }, outputDir: "../../test-results/mobile",
  reporter: [["list"], ["html", { outputFolder: "test-results/mobile-report", open: "never" }]],
  use: { ...devices["Pixel 7"], channel: "chrome", headless: true, baseURL: `http://127.0.0.1:${port}`,
    reducedMotion: "reduce", screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: { command: "node --import tsx tests/e2e/mobile-server.ts", url: `http://127.0.0.1:${port}`,
    cwd: path.resolve(import.meta.dirname, "../.."),
    reuseExistingServer: false, timeout: 30000, gracefulShutdown: { signal: "SIGTERM", timeout: 5000 } },
});
