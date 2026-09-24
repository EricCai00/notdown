import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "desktop.test.ts",
  workers: 1,
  timeout: 60_000,
  outputDir: "../../test-results/desktop",
  reporter: "list",
  use: { trace: "retain-on-failure" },
});
