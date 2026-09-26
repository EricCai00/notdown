import { z } from "zod";
import { runtimeSettingsSchema } from "./runtime-settings";
import { NotebookWorker } from "./notebook-worker";
import { rMarkdownCapabilities, rscriptPath } from "./rmarkdown";
import { VaultError } from "./vault";
import type { RuntimeCheck } from "../src/shared/runtime-settings";

const schema = z.object({ language: z.enum(["r", "python", "julia"]), settings: runtimeSettingsSchema }).strict();
/** Tests the form's unsaved values in a temporary session, without changing existing notebooks. */
export async function checkRuntime(input: unknown, signal?: AbortSignal): Promise<RuntimeCheck> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new VaultError(400, "Expected a supported language and interpreter settings");
  const { language, settings } = parsed.data;
  if (language === "r") {
    const result = await rMarkdownCapabilities(signal, settings);
    return { available: result.available, detail: result.available
      ? `${result.version}\n${await rscriptPath(settings.rscript)}\nrmarkdown, knitr, jsonlite and Pandoc are available.`
      : [result.error, result.help].filter(Boolean).join("\n") };
  }
  const worker = new NotebookWorker(() => {}, language, async () => settings);
  const cancel = () => worker.stop();
  const timer = setTimeout(() => worker.stop(new VaultError(408, "Interpreter check exceeded 60 seconds")), 60_000);
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (signal?.aborted) throw new VaultError(499, "Interpreter check cancelled");
    await worker.start();
    const code = language === "python" ? 'import sys; print(sys.executable); print(sys.version)' : 'println(joinpath(Sys.BINDIR, Base.julia_exename())); println(VERSION)';
    const result = await worker.execute({ cells: [{ index: 0, code }], inline: true });
    const error = result.error || result.outputs[0]?.error;
    return { available: !error, detail: error || result.outputs[0]?.text || "Kernel is ready." };
  } catch (error) { return { available: false, detail: error instanceof Error ? error.message : String(error) }; }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); worker.stop(); }
}
