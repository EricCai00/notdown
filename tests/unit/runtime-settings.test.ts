import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createVault, VaultError } from "../../server/vault";
import { createApp } from "../../server/app";
import { runtimeEnvironment } from "../../server/runtime-settings";
import { checkRuntime } from "../../server/runtime-check";
import { runtimeKeys, type RuntimeSettings } from "../../src/shared/runtime-settings";
import { QuartoNotebook } from "../../server/quarto-notebook";

const defaults = () => Object.fromEntries(runtimeKeys.map(key => [key, ""])) as RuntimeSettings;
async function temporary(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-runtime-settings-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, vault: createVault(root) };
}

test("runtime settings persist independently of page source and preserve unknown fields", async t => {
  const { root, vault } = await temporary(t);
  const page = await vault.create({ title: "Runtime test", body: "Keep my source\n" });
  const initial = await vault.runtimeSettings.get();
  assert.deepEqual(initial.settings, defaults());
  const filename = path.join(root, ".notdown", "runtimes.json");
  await fs.mkdir(path.dirname(filename));
  await fs.writeFile(filename, JSON.stringify({ custom: { future: true }, ...defaults() }));
  const before = await vault.runtimeSettings.get();
  const settings = { ...defaults(), python: "C:\\Python with spaces\\python.exe", juliaKernel: "julia-1.10" };
  const saved = await vault.runtimeSettings.configure({ settings, baseRevision: before.revision });
  assert.deepEqual((await createVault(root).runtimeSettings.get()).settings, settings);
  assert.deepEqual(JSON.parse(await fs.readFile(filename, "utf8")).custom, { future: true });
  assert.equal((await vault.get(page.id)).revision, page.revision);
  const reset = await vault.runtimeSettings.configure({ settings: defaults(), baseRevision: saved.revision });
  assert.deepEqual(reset.settings, defaults());
});

test("concurrent settings saves reject stale revisions and keep both versions recoverable", async t => {
  const { root, vault } = await temporary(t);
  const second = createVault(root), initial = await vault.runtimeSettings.get();
  const firstSettings = { ...defaults(), python: "first-python" };
  const secondSettings = { ...defaults(), python: "second-python" };
  const result = await Promise.allSettled([
    vault.runtimeSettings.configure({ settings: firstSettings, baseRevision: initial.revision }),
    second.runtimeSettings.configure({ settings: secondSettings, baseRevision: initial.revision }),
  ]);
  assert.equal(result.filter(item => item.status === "fulfilled").length, 1);
  const failure = result.find(item => item.status === "rejected") as PromiseRejectedResult;
  assert.equal(failure.reason.status, 409);
  const record = JSON.parse(await fs.readFile(path.join(root, ".notdown", failure.reason.details.conflictFile), "utf8"));
  const current = JSON.parse(record.current), proposed = JSON.parse(record.proposed);
  assert.deepEqual(new Set([current.python, proposed.python]), new Set(["first-python", "second-python"]));
  assert.equal((await vault.runtimeSettings.get()).settings.python, current.python);
});

test("invalid settings and malformed stored files cannot overwrite configuration", async t => {
  const { root, vault } = await temporary(t);
  const initial = await vault.runtimeSettings.get();
  for (const input of [{ settings: defaults() }, { settings: { ...defaults(), python: "x\ncommand" }, baseRevision: initial.revision },
    { settings: { ...defaults(), unknown: "x" }, baseRevision: initial.revision }]) {
    await assert.rejects(vault.runtimeSettings.configure(input), (error: unknown) => error instanceof VaultError && error.status === 400);
  }
  const filename = path.join(root, ".notdown", "runtimes.json");
  await fs.mkdir(path.dirname(filename));
  await fs.writeFile(filename, "{bad json");
  await assert.rejects(vault.runtimeSettings.get(), /original file was preserved/);
  await assert.rejects(vault.runtimeSettings.configure({ settings: defaults(), baseRevision: initial.revision }), /original file was preserved/);
  assert.equal(await fs.readFile(filename, "utf8"), "{bad json");
});

test("runtime overrides are child-local and explicit broken interpreters never fall back", async t => {
  const { root } = await temporary(t);
  const keys = ["NOTDOWN_PYTHON", "PANDOC_PATH", "RSTUDIO_PANDOC", "NOTDOWN_JUPYTER_JULIA_KERNEL"];
  const before = keys.map(key => process.env[key]), invalid = path.join(root, "missing interpreter");
  const env = runtimeEnvironment({ python: invalid, pandoc: path.join(root, "bin", "pandoc"), juliaKernel: "julia-custom" });
  assert.equal(env.NOTDOWN_PYTHON, invalid);
  assert.equal(env.RSTUDIO_PANDOC, path.join(root, "bin"));
  assert.equal(env.NOTDOWN_JUPYTER_JULIA_KERNEL, "julia-custom");
  assert.deepEqual(keys.map(key => process.env[key]), before);
  for (const language of ["r", "python", "julia"] as const) {
    const result = await checkRuntime({ language, settings: { ...defaults(), rscript: invalid, python: invalid } });
    assert.equal(result.available, false);
    assert.match(result.detail, language === "r" ? /Rscript could not start/ : /Python 3.9/);
  }
});

test("runtime APIs persist settings and route R capabilities, Knit and notebook execution through them", { timeout: 30_000 }, async t => {
  const { root } = await temporary(t);
  const app = createApp({ vaultPath: root });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => { app.locals.closeRNotebook(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/api`;
  const send = (route: string, body: unknown, method = "POST") => fetch(url + route, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const initial = await (await fetch(url + "/runtimes/settings")).json();
  const settings = { ...defaults(), rscript: path.join(root, "does-not-exist"), python: path.join(root, "no-python") };
  assert.equal((await send("/runtimes/settings", { settings, baseRevision: initial.revision }, "PUT")).status, 200);
  assert.equal((await (await fetch(url + "/runtimes/settings")).json()).settings.rscript, settings.rscript);
  assert.equal((await (await fetch(url + "/rmarkdown/capabilities")).json()).available, false);
  assert.equal((await send("/rmarkdown/run", { source: "Text" })).status, 503);
  assert.equal((await send("/rmarkdown/notebook", { session: randomUUID(), variant: "rmarkdown", source: "```{r}\n1\n```", mode: "current", index: 0 })).status, 503);
  const quarto = await (await send("/quarto/notebook", { session: randomUUID(), variant: "quarto", source: "```{python}\n1\n```", mode: "current", index: 0 })).json();
  assert.match(quarto.outputs[0].error, /Python 3.9/);
  assert.equal((await send("/runtimes/check", { language: "ruby", settings })).status, 400);
  const untrusted = await fetch(url + "/runtimes/settings", { method: "PUT", headers: { "Content-Type": "application/json", Origin: "https://example.com" }, body: JSON.stringify({ settings, baseRevision: initial.revision }) });
  assert.equal(untrusted.status, 403);
});

test("saved Python and Julia paths run real kernels and report their interpreter", { timeout: 120_000 }, async t => {
  if (!process.env.NOTDOWN_PYTHON) { t.skip("Set NOTDOWN_PYTHON to test installed kernels"); return; }
  const { vault } = await temporary(t), initial = await vault.runtimeSettings.get();
  const settings = { ...defaults(), python: process.env.NOTDOWN_PYTHON, jupyterDataDir: process.env.JUPYTER_DATA_DIR || "",
    juliaKernel: process.env.NOTDOWN_JUPYTER_JULIA_KERNEL || "", julia: process.env.NOTDOWN_JULIA || "" };
  await vault.runtimeSettings.configure({ settings, baseRevision: initial.revision });
  const python = await checkRuntime({ language: "python", settings });
  assert.equal(python.available, true, python.detail);
  assert.ok(python.detail.toLowerCase().includes(settings.python.toLowerCase()), python.detail);
  if (process.env.NOTDOWN_TEST_JULIA) {
    const julia = await checkRuntime({ language: "julia", settings });
    assert.equal(julia.available, true, julia.detail);
    if (settings.julia) assert.ok(julia.detail.toLowerCase().includes(settings.julia.toLowerCase()), julia.detail);
  }
  const notebook = new QuartoNotebook(async () => (await vault.runtimeSettings.get()).settings);
  t.after(() => notebook.close());
  const response = await notebook.execute({ session: randomUUID(), variant: "quarto", source: "```{python}\nprint(21 * 2)\n```", mode: "current", index: 0 });
  assert.match(response.outputs[0].html || "", /42/);
});
