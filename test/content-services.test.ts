import assert from "node:assert/strict";
import test from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createVault } from "../server/vault";
import { contentServices } from "../server/content-services";

test("configured services send only explicit content and keep credentials out of settings responses", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-services-"));
  try {
    const vault = createVault(root); await vault.init();
    const calls: { url: string; init: RequestInit }[] = [];
    const services = contentServices(vault, (async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return Response.json(String(url).endsWith("transcriptions") ? { text: "Transcript" } : { choices: [{ message: { content: "Generated result" } }] });
    }) as typeof fetch);
    await assert.rejects(services.generate({ prompt: "Hello" }), /Configure a model/);
    const saved = await services.configure({ endpoint: "https://models.example/v1", model: "my-model", transcriptionModel: "my-transcriber", apiKey: "test-secret" });
    assert.equal(saved.hasKey, true); assert(!JSON.stringify(saved).includes("test-secret"));
    assert.deepEqual(await services.generate({ prompt: "Summarize", context: "Selected content" }), { text: "Generated result" });
    assert.equal(calls[0].url, "https://models.example/v1/chat/completions");
    assert.equal((calls[0].init.headers as Record<string,string>).Authorization, "Bearer test-secret");
    assert.deepEqual(JSON.parse(String(calls[0].init.body)).messages, [{ role: "user", content: "Summarize\n\nCurrent text:\nSelected content" }]);
    await fs.writeFile(path.join(vault.assetsPath, "sample.wav"), "test-audio");
    assert.deepEqual(await services.transcribe({ path: "assets/sample.wav", language: "en" }), { text: "Transcript" });
    assert.equal((calls[1].init.body as FormData).get("model"), "my-transcriber");
    await assert.rejects(services.transcribe({ path: "../secret.wav" }), /audio attachment/);
    await services.configure({ endpoint: "https://models.example/v1", model: "other-model", transcriptionModel: "my-transcriber" });
    assert.equal((await services.settings()).hasKey, true);
    await services.configure({ endpoint: "http://127.0.0.1:9999/v1", model: "local", transcriptionModel: "local", clearKey: true });
    assert.equal((await services.settings()).hasKey, false);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("service errors reject malformed results and never echo provider secrets", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-services-errors-"));
  try {
    const vault = createVault(root); await vault.init();
    let response = Response.json(null);
    const services = contentServices(vault, (async () => response) as typeof fetch);
    await services.configure({ endpoint: "http://localhost:9999/v1", model: "local", transcriptionModel: "audio", apiKey: "secret-value" });
    await assert.rejects(services.generate({ prompt: "test" }), /returned no text/);
    response = new Response("provider secret-value", { status: 401 });
    await assert.rejects(services.generate({ prompt: "test" }), error => { assert(!String(error).includes("secret-value")); return /HTTP 401/.test(String(error)); });
    response = new Response("invalid json");
    await assert.rejects(services.generate({ prompt: "test" }), /invalid JSON/);
    for (const endpoint of ["http://remote.example/v1", "https://user:pass@models.example/v1", "https://models.example/v1?key=secret"]) {
      await assert.rejects(services.configure({ endpoint, model: "local", transcriptionModel: "audio" }), /HTTPS or a local HTTP/);
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
