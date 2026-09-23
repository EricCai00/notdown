import { defineConfig, devices } from "@playwright/test";

const testPort = Number(process.env.NOTDOWN_E2E_PORT || 4329);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  outputDir: "test-results/browser",
  reporter: [
    ["list"],
    ["html", { outputFolder: "test-results/report", open: "never" }],
  ],
  use: {
    ...devices["Desktop Chrome"],
    channel: "chrome",
    headless: true,
    baseURL: `http://127.0.0.1:${testPort}`,
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node --import tsx e2e/server.ts",
    url: `http://127.0.0.1:${testPort}/api/status`,
    reuseExistingServer: false,
    timeout: 30_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  },
});
