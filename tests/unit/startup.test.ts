import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";

test("service startup reads the ignored local .env and respects shell vault overrides", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-startup-"));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("notdown-startup-"));
    await fs.rm(root, { recursive: true, force: true });
  });
  const configured = path.join(root, "Local notes 中文");
  await fs.writeFile(path.join(root, ".env"), `VAULT_PATH="${configured.replaceAll("\\", "/")}"\n`);

  for (const override of [undefined, path.join(root, "Shell notes")]) {
    await t.test(override ? "shell wins" : "local file selects the vault", async () => {
      const probe = createServer().listen(0, "127.0.0.1");
      await once(probe, "listening");
      const address = probe.address();
      assert.ok(address && typeof address !== "string");
      await new Promise<void>(resolve => probe.close(() => resolve()));
      const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(address.port) };
      delete env.VAULT_PATH;
      if (override) env.VAULT_PATH = override;
      const child = spawn(process.execPath, ["--import", import.meta.resolve("tsx"), fileURLToPath(new URL("../../server/index.ts", import.meta.url))], {
        cwd: root, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
      });
      let output = "";
      child.stdout.on("data", data => { output += String(data); });
      child.stderr.on("data", data => { output += String(data); });
      let timeout: NodeJS.Timeout | undefined;
      try {
        const ready = new Promise<void>((resolve, reject) => {
          timeout = setTimeout(() => reject(new Error(`Startup timed out: ${output}`)), 20_000);
          child.stdout.on("data", () => { if (output.includes("Vault:")) resolve(); });
          child.once("error", reject);
          child.once("exit", code => reject(new Error(`Startup exited ${code}: ${output}`)));
        });
        await ready;
        const status = await fetch(`http://127.0.0.1:${address.port}/api/status`).then(response => response.json());
        assert.equal(status.vaultPath, override ?? configured);
        assert.deepEqual(await fs.readdir(path.join(override ?? configured, "pages")), []);
        await assert.rejects(fs.stat(path.join(root, "vault")), { code: "ENOENT" });
      } finally {
        clearTimeout(timeout);
        if (child.exitCode === null) {
          const exited = once(child, "exit");
          child.kill();
          await exited;
        }
      }
    });
  }
});
