import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

test("Windows shutdown selects services safely and stops supervisors before workers", {
  skip: process.platform !== "win32",
  timeout: 30_000,
}, async () => {
  const { stdout } = await promisify(execFile)("powershell.exe", [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
    fileURLToPath(new URL("./stop-script-fixture.ps1", import.meta.url)),
  ], { timeout: 25_000 });
  assert.match(stdout, /Shutdown scenarios passed/);
});
