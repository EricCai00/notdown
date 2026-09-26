import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { VaultError } from "./vault.js";
import { runtimeEnvironment } from "./runtime-settings";
import type { RuntimeOptions } from "../src/shared/runtime-settings";

const setupHelp = 'Install R, run install.packages("rmarkdown") in R, and install Pandoc. Set NOTDOWN_RSCRIPT to the Rscript executable if it is not on PATH.';
const requestSchema = z.object({ source: z.string().max(128_000) }).strict();
const outputLimit = 8 * 1024 * 1024;
let running = 0;

export async function rscriptPath(override?: string) {
  if (override) return override;
  if (process.env.NOTDOWN_RSCRIPT) return process.env.NOTDOWN_RSCRIPT;
  if (process.platform === "win32") {
    const root = path.join(process.env.ProgramFiles || "C:/Program Files", "R");
    const versions = await fs.readdir(root).catch(() => [] as string[]);
    for (const version of versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
      const executable = path.join(root, version, "bin", "Rscript.exe");
      if (await fs.stat(executable).then(s => s.isFile(), () => false)) return executable;
    }
  }
  return "Rscript";
}

function run(executable: string, args: string[], cwd: string, signal?: AbortSignal, timeout = 60_000, settings: RuntimeOptions = {}): Promise<string> {
  if (signal?.aborted) return Promise.reject(new VaultError(499, "R execution cancelled"));
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["--vanilla", ...args], {
      cwd, windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      env: runtimeEnvironment(settings),
    });
    let size = 0, log = "", failure: Error | undefined;
    const stop = (error: Error) => {
      if (failure) return;
      failure = error;
      if (!child.pid) return;
      if (process.platform === "win32") {
        const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        killer.on("error", () => child.kill());
      } else {
        try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
      }
    };
    const timer = setTimeout(() => stop(new VaultError(408, `R execution exceeded ${timeout / 1000} seconds`)), timeout);
    const abort = () => stop(new VaultError(499, "R execution cancelled"));
    signal?.addEventListener("abort", abort, { once: true });
    const collect = (data: string) => {
      size += Buffer.byteLength(data);
      if (size > outputLimit) { stop(new VaultError(413, "R output exceeds 8 MB")); return; }
      log += data;
    };
    child.stdout.setEncoding("utf8").on("data", collect);
    child.stderr.setEncoding("utf8").on("data", collect);
    child.on("error", () => { failure = new VaultError(503, `Rscript could not start. ${setupHelp}`); });
    child.on("close", code => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new VaultError(422, log.slice(-16_000) || "R execution failed"));
      else resolve(log);
    });
    if (signal?.aborted) abort();
  });
}

export async function rMarkdownCapabilities(signal?: AbortSignal, settings: RuntimeOptions = {}) {
  const executable = await rscriptPath(settings.rscript);
  try {
    const log = await run(executable, ["-e", 'if (!requireNamespace("rmarkdown", quietly=TRUE) || !requireNamespace("knitr", quietly=TRUE) || !requireNamespace("jsonlite", quietly=TRUE)) stop("Missing rmarkdown/knitr/jsonlite"); if (!rmarkdown::pandoc_available()) stop("Missing Pandoc"); cat("NOTDOWN_R_READY:", R.version.string, "\\n", sep="")'], os.tmpdir(), signal, 15_000, settings);
    const version = /NOTDOWN_R_READY:([^\r\n]+)/.exec(log)?.[1];
    return { available: Boolean(version), version: version || "", help: setupHelp };
  } catch (error) {
    return { available: false, version: "", help: setupHelp, error: error instanceof Error ? error.message : String(error) };
  }
}

// The source is data in a file, never an interpolated command or shell argument.
// rmarkdown/knitr own all evaluation semantics, including params, inline R,
// labels, global options, eval/echo/include, warnings, tables and plots.
const driver = `
if (.Platform$OS.type == "windows") invisible(suppressWarnings(Sys.setlocale("LC_CTYPE", ".UTF-8")))
if (!requireNamespace("rmarkdown", quietly=TRUE) || !requireNamespace("knitr", quietly=TRUE))
  stop('Missing packages. Run install.packages("rmarkdown") in R.')
if (!rmarkdown::pandoc_available()) stop('Pandoc is required. Install Pandoc or set PANDOC_PATH.')
options(encoding = "UTF-8")
knitr::opts_chunk$set(error = FALSE)
rmarkdown::render("document.Rmd",
  output_format = rmarkdown::html_document(self_contained = TRUE, theme = NULL, mathjax = NULL, highlight = "pygments"),
  output_file = "result.html", envir = new.env(parent = globalenv()),
  encoding = "UTF-8", quiet = TRUE)
`;

export async function executeRMarkdown(input: unknown, signal?: AbortSignal, settings: RuntimeOptions = {}) {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw new VaultError(400, "Expected R Markdown source (maximum 128,000 characters)");
  if (running >= 2) throw new VaultError(429, "R is busy. Stop a running document or try again later.");
  running++;
  let directory: string | undefined;
  try {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-rmarkdown-"));
    await fs.writeFile(path.join(directory, "document.Rmd"), parsed.data.source, "utf8");
    await fs.writeFile(path.join(directory, "run.R"), driver, "utf8");
    const log = await run(await rscriptPath(settings.rscript), ["run.R"], directory, signal, 60_000, settings);
    const filename = path.join(directory, "result.html");
    if ((await fs.stat(filename)).size > outputLimit) throw new VaultError(413, "Rendered R Markdown exceeds 8 MB");
    return { html: await fs.readFile(filename, "utf8"), log: log.slice(-16_000) };
  } finally {
    // Remove only the directory created for this request, never the vault.
    if (directory && path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith("notdown-rmarkdown-"))
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    running--;
  }
}
