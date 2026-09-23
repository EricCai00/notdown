import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { VaultError, type createVault } from "./vault";

const configSchema = z.object({
  endpoint: z.string().max(2000), model: z.string().max(200), transcriptionModel: z.string().max(200),
  apiKey: z.string().max(4000).optional(), clearKey: z.boolean().optional(),
}).strict();
type Settings = { endpoint: string; model: string; transcriptionModel: string; apiKey: string };
const defaults: Settings = { endpoint: "https://api.openai.com/v1", model: "", transcriptionModel: "", apiKey: "" };
export function contentServices(vault: ReturnType<typeof createVault>, request: typeof fetch = fetch) {
  const file = path.join(vault.vaultPath, ".notdown", "services.json");
  let pending = Promise.resolve(), running = 0;
  async function read(): Promise<Settings> {
    try { return { ...defaults, ...JSON.parse(await fs.readFile(file, "utf8")) }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...defaults }; throw error; }
  }
  function endpoint(value: string) {
    let url: URL; try { url = new URL(value); } catch { throw new VaultError(400, "Invalid service endpoint"); }
    if (url.username || url.password || url.search || url.hash || !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new VaultError(400, "Use HTTPS or a local HTTP endpoint without credentials or query parameters");
    return url.href.replace(/\/$/, "");
  }
  async function settings() { const { apiKey, ...values } = await read(); return { ...values, hasKey: !!apiKey }; }
  async function configure(input: unknown) {
    const result = configSchema.safeParse(input); if (!result.success) throw new VaultError(400, "Invalid service settings");
    const values = result.data; const base = endpoint(values.endpoint);
    const operation = pending.then(async () => {
      const old = await read();
      const next: Settings = { endpoint: base, model: values.model.trim(), transcriptionModel: values.transcriptionModel.trim(), apiKey: values.clearKey ? "" : values.apiKey || old.apiKey };
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temporary = file + ".tmp";
      await fs.writeFile(temporary, JSON.stringify(next), { mode: 0o600 });
      await fs.rename(temporary, file);
    });
    pending = operation.catch(() => {}); await operation; return settings();
  }
  async function call(config: Settings, resource: string, model: string, body: BodyInit, json: boolean) {
    if (!model) throw new VaultError(400, "Configure a model in Settings first");
    if (running >= 2) throw new VaultError(429, "Two service requests are already running");
    running++;
    try {
      const response = await request(endpoint(config.endpoint) + resource, { method: "POST", redirect: "error", signal: AbortSignal.timeout(120_000), headers: { ...(config.apiKey ? { Authorization: "Bearer " + config.apiKey } : {}), ...(json ? { "Content-Type": "application/json" } : {}) }, body });
      if (!response.ok) throw new VaultError(502, `Model service returned HTTP ${response.status}`);
      const reader = response.body?.getReader(), chunks: Uint8Array[] = []; let size = 0;
      if (reader) try {
        for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 2_000_000) { await reader.cancel(); throw new VaultError(502, "Service result is too large"); } chunks.push(value); }
      } finally { reader.releaseLock(); }
      const text = Buffer.concat(chunks).toString("utf8");
      try { return JSON.parse(text); } catch { throw new VaultError(502, "Model service returned invalid JSON"); }
    } catch (error) { if (error instanceof VaultError) throw error; throw new VaultError(502, "Model service could not be reached or timed out"); }
    finally { running--; }
  }
  async function generate(input: unknown) {
    const parsed = z.object({ prompt: z.string().min(1).max(100000), context: z.string().max(500000).default(""), model: z.string().max(200).default("") }).strict().safeParse(input);
    if (!parsed.success) throw new VaultError(400, "Enter a prompt to generate text");
    const values = parsed.data, config = await read(), model = values.model || config.model;
    const result = await call(config, "/chat/completions", model, JSON.stringify({ model, stream: false, messages: [{ role: "user", content: values.prompt + (values.context ? "\n\nCurrent text:\n" + values.context : "") }] }), true);
    const text = result?.choices?.[0]?.message?.content;
    if (typeof text !== "string") throw new VaultError(502, "Model service returned no text");
    return { text };
  }
  async function transcribe(input: unknown) {
    const parsed = z.object({ path: z.string().max(500), language: z.string().max(30).default("") }).strict().safeParse(input);
    if (!parsed.success || !/^assets\/[\w.-]+\.(?:mp3|mp4|mpeg|mpga|m4a|wav|webm|ogg|flac)$/i.test(parsed.data.path)) throw new VaultError(400, "Choose an audio attachment from this vault");
    const config = await read();
    if (!config.transcriptionModel) throw new VaultError(400, "Configure a transcription model in Settings first");
    const name = path.basename(parsed.data.path), root = await fs.realpath(vault.assetsPath);
    let full: string;
    try { full = await fs.realpath(path.join(root, name)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new VaultError(404, "Audio attachment was not found"); throw error; }
    if (path.dirname(full) !== root) throw new VaultError(400, "Audio must stay inside the vault attachments directory");
    const stat = await fs.stat(full); if (!stat.isFile() || stat.size > 25_000_000) throw new VaultError(400, "Audio must be a file no larger than 25 MB");
    const model = config.transcriptionModel, form = new FormData();
    form.set("model", model); form.set("response_format", "json");
    if (parsed.data.language) form.set("language", parsed.data.language);
    form.set("file", new Blob([new Uint8Array(await fs.readFile(full))], { type: "application/octet-stream" }), name);
    const result = await call(config, "/audio/transcriptions", model, form, false);
    if (typeof result?.text !== "string") throw new VaultError(502, "Model service returned no transcript");
    return { text: result.text };
  }
  return { settings, configure, generate, transcribe };
}
