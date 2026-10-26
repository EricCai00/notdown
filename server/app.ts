import express from "express";
import { contentServices } from "./content-services";
import { linkPreviews } from "./link-previews";
import { bookmarks } from "./bookmarks";
import type { Request, Response, NextFunction } from "express";
import path from "node:path";
import { promises as fs } from "node:fs";
import { createVault, VaultError } from "./vault.js";
import { createGitHistory } from "./git-history.js";
import { openFile } from "./open-file.js";
import { getMarkdownLabCapabilities, renderPreview, PreviewError, renderCitations } from "./pandoc.js";
import { z } from "zod";
import {syntaxFiles} from './syntax-files.js';
import {bibliographyEntries} from '../src/markdown-engine/bibliography.js';
import { prepareMarkdownImport, importSummary, type ImportPlan } from "./markdown-import.js";
import { prepareNotionImport } from "./notion-import.js";
import { importResponse } from "./import-response.js";
import { executeRMarkdown, rMarkdownCapabilities } from "./rmarkdown.js";
import { RNotebook } from "./r-notebook";
import { QuartoNotebook } from "./quarto-notebook";
import { checkRuntime } from "./runtime-check";
import { WebDavError } from "../src/sync/webdav";
import type { BrowserVaultManagement } from "./browser-vaults.js";

export function createApp(options: {
  vaultPath: string;
  frontendDir?: string;
  allowedOrigins?: string[];
  recycleFile?: (filename: string) => Promise<void>;
  openFile?: (filename: string) => Promise<void>;
  accessToken?: string;
  vaultManagement?: BrowserVaultManagement;
  notionImportTransport?: Parameters<typeof prepareNotionImport>[1];
}) {
  const app = express();
  let gitHistory: ReturnType<typeof createGitHistory>;
  const vault = createVault(options.vaultPath, { recycleFile: options.recycleFile, onChange: () => gitHistory?.changed() });
  gitHistory = createGitHistory(vault);
  app.locals.vault = vault;
  app.locals.gitHistory = gitHistory;
  void gitHistory.start().catch(error => console.warn("Git history could not start", error));
  app.disable("x-powered-by");
  const origins = new Set(
    options.allowedOrigins ?? [
      "http://localhost:4317",
      "http://127.0.0.1:4317",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:4318",
      "http://127.0.0.1:4318",
      "http://localhost:4173",
      "http://127.0.0.1:4173",
    ],
  );
  app.use((req, res, next) => {
    const host = req.hostname;
    if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(host)) {
      res.status(403).json({ error: "Only local addresses are allowed" });
      return;
    }
    const origin = req.get("origin");
    const sameOrigin = origin === `${req.protocol}://${req.get("host")}`;
    if (origin && !sameOrigin && !origins.has(origin)) {
      res.status(403).json({ error: "This origin cannot access the local vault" });
      return;
    }
    if (options.accessToken && req.get("X-Notdown-Desktop") !== options.accessToken) {
      res.status(403).json({ error: "This desktop vault is available only inside its application window" });
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (origin && (sameOrigin || origins.has(origin))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    if (
      req.path.startsWith("/api/") &&
      ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
      !req.is("application/json")
    ) {
      res.status(415).json({ error: "Write requests must use application/json" });
      return;
    }
    next();
  });
  app.use(express.json({ limit: "30mb" }));
  const route =
    (handler: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(handler(req, res)).catch(next);
    };

  const files=syntaxFiles(vault);
  if (options.vaultManagement) {
    app.get("/api/vaults", route(async (_req, res) => {
      res.setHeader("Cache-Control", "no-store");
      return res.json(await options.vaultManagement!.list());
    }));
    app.post("/api/vaults/open", route(async (req, res) => res.json(await options.vaultManagement!.open(req.body ?? {}))));
  }
  app.get("/api/sync/:action", route(async (req, res) => { res.setHeader("Cache-Control", "no-store"); return res.json(await vault.sync.handle(String(req.params.action), "GET")); }));
  app.post("/api/sync/:action", route(async (req, res) => { res.setHeader("Cache-Control", "no-store"); return res.json(await vault.sync.handle(String(req.params.action), "POST", req.body)); }));
  app.get("/api/databases", route(async (_req, res) => { res.setHeader("Cache-Control", "no-store"); return res.json(await vault.databases.list()); }));
  app.post("/api/databases", route(async (req, res) => res.status(201).json(await vault.databases.create(req.body))));
  app.get("/api/databases/:id", route(async (req, res) => { res.setHeader("Cache-Control", "no-store"); return res.json(await vault.databases.get(String(req.params.id))); }));
  app.put("/api/databases/:id", route(async (req, res) => res.json(await vault.databases.updatePresentation(String(req.params.id), req.body))));
  app.put("/api/databases/:id/icon", route(async (req, res) => res.json(await vault.databases.updateIcon(String(req.params.id), req.body))));
  app.get("/api/data-sources/:id", route(async (req, res) => { res.setHeader("Cache-Control", "no-store"); return res.json(await vault.databases.getSource(String(req.params.id))); }));
  app.put("/api/data-sources/:id", route(async (req, res) => { const { baseRevision, ...input } = req.body ?? {}; return res.json(await vault.databases.updateSource(String(req.params.id), input, baseRevision)); }));
  app.put("/api/database-views/:id", route(async (req, res) => { const { baseRevision, ...input } = req.body ?? {}; return res.json(await vault.databases.updateView(String(req.params.id), input, baseRevision)); }));
  app.post("/api/databases/:id/views", route(async (req, res) => { const { baseRevision, ...input } = req.body ?? {}; return res.status(201).json(await vault.databases.createView(String(req.params.id), input, baseRevision)); }));
  app.post("/api/data-sources/:id/records", route(async (req, res) => { const { baseRevision, ...input } = req.body ?? {}; return res.status(201).json(await vault.databases.createRecord(String(req.params.id), input, baseRevision)); }));
  app.put("/api/data-sources/:id/records/:pageId", route(async (req, res) => res.json(await vault.databases.updateCell(String(req.params.id), String(req.params.pageId), req.body ?? {}))));
  app.post("/api/data-sources/:id/records/:pageId/remove", route(async (req, res) => res.json(await vault.databases.removeRecord(String(req.params.id), String(req.params.pageId), req.body?.baseRevision, req.body?.schemaRevision))));
  const runtimeSettings = async () => (await vault.runtimeSettings.get()).settings;
  const notebook = new RNotebook(runtimeSettings);
  const quarto = new QuartoNotebook(runtimeSettings);
  app.locals.closeRNotebook = () => { notebook.close(); quarto.close(); vault.closeHistory(); void gitHistory.close(); };
  app.get("/api/history/settings", route(async (_req, res) => { res.setHeader("Cache-Control", "no-store"); return res.json(await gitHistory.status()); }));
  app.put("/api/history/settings", route(async (req, res) => res.json(await gitHistory.configure(req.body))));
  app.post("/api/history/checkpoint", route(async (req, res) => {
    if (!(await vault.history.getSettings()).settings.gitEnabled) throw new VaultError(400, "Enable local Git history first");
    await vault.checkpointHistory(true, req.body?.message || "Manual checkpoint");
    return res.json(await gitHistory.checkpoint(req.body?.message || "Manual checkpoint"));
  }));
  app.get("/api/pages/:id/history", route(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const page = await vault.get(String(req.params.id));
    const entries = [...(await Promise.all([page.id, ...(page.legacyIds ?? [])].map(id => vault.history.list(id)))).flat(), ...await gitHistory.list(page.id)];
    return res.json(entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }));
  const historyRecord = async (id: string, kind: string, revision: string) => {
    if (kind === "snapshot") {
      const page = await vault.get(id);
      for (const candidate of [page.id, ...(page.legacyIds ?? [])]) {
        try { return await vault.history.read(candidate, revision); }
        catch (error) { if (!(error instanceof VaultError) || error.status !== 404) throw error; }
      }
      throw new VaultError(404, "History version not found");
    }
    if (kind === "git") return gitHistory.read(id, revision);
    throw new VaultError(400, "Unknown history source");
  };
  app.get("/api/pages/:id/history/:kind/:revision", route(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const id = (await vault.get(String(req.params.id))).id;
    return res.json(await historyRecord(id, String(req.params.kind), String(req.params.revision)));
  }));
  app.post("/api/pages/:id/history/:kind/:revision/restore", route(async (req, res) => {
    const id = (await vault.get(String(req.params.id))).id;
    const record = await historyRecord(id, String(req.params.kind), String(req.params.revision));
    return res.json(await vault.restoreHistory(id, record, req.body?.baseRevision));
  }));
  app.get("/api/runtimes/settings", route(async (_req, res) => {
    res.setHeader("Cache-Control", "no-store"); return res.json(await vault.runtimeSettings.get());
  }));
  app.put("/api/runtimes/settings", route(async (req, res) => {
    const saved = await vault.runtimeSettings.configure(req.body);
    notebook.close(); quarto.close();
    return res.json(saved);
  }));
  let checkingRuntimes = 0;
  app.post("/api/runtimes/check", route(async (req, res) => {
    if (checkingRuntimes >= 2) throw new VaultError(429, "Two interpreter checks are already running. Please wait.");
    checkingRuntimes++;
    const controller = new AbortController();
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", cancel); res.setHeader("Cache-Control", "no-store");
    try { return res.json(await checkRuntime(req.body, controller.signal)); }
    finally { checkingRuntimes--; res.off("close", cancel); }
  }));
  app.post("/api/quarto/notebook", route(async (req, res) => {
    const controller = new AbortController();
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", cancel); res.setHeader("Cache-Control", "no-store");
    try { return res.json(await quarto.execute(req.body, controller.signal)); }
    finally { res.off("close", cancel); }
  }));
  app.delete("/api/quarto/notebook/:session", route(async (req, res) => {
    quarto.dispose(String(req.params.session)); res.json({ closed: true });
  }));
  app.post("/api/rmarkdown/notebook", route(async (req, res) => {
    const controller = new AbortController();
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", cancel); res.setHeader("Cache-Control", "no-store");
    try { return res.json(await notebook.execute(req.body, controller.signal)); }
    finally { res.off("close", cancel); }
  }));
  app.delete("/api/rmarkdown/notebook/:session", route(async (req, res) => {
    notebook.dispose(String(req.params.session)); res.json({ closed: true });
  }));
  app.get("/api/rmarkdown/capabilities", route(async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.json(await rMarkdownCapabilities(undefined, await runtimeSettings()));
  }));
  app.post("/api/rmarkdown/run", route(async (req, res) => {
    const controller = new AbortController();
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", cancel);
    res.setHeader("Cache-Control", "no-store");
    try { return res.json(await executeRMarkdown(req.body, controller.signal, await runtimeSettings())); }
    finally { res.off("close", cancel); }
  }));
  // Plans contain the exact selected bytes. Commit never rereads a changing source folder.
  const imports = new Map<string, { plan: ImportPlan; expires: number }>();
  app.post("/api/import/preview", route(async (req, res) => {
    for (const [key, value] of imports) if (value.expires < Date.now()) imports.delete(key);
    if (imports.size >= 3) imports.delete(imports.keys().next().value!);
    const plan = prepareMarkdownImport(req.body);
    imports.set(plan.id, { plan, expires: Date.now() + 30 * 60_000 });
    return res.json(importSummary(plan));
  }));
  app.post("/api/import/commit", route(async (req, res) => {
    const entry = imports.get(req.body?.id);
    if (!entry || entry.expires < Date.now()) throw new VaultError(410, "Import preview expired. Prepare a new preview.");
    if (entry.plan.errors.length && req.body.skipInvalid !== true) throw new VaultError(400, "Review and explicitly skip invalid files before importing");
    return importResponse(req, res, progress => vault.importBatch(entry.plan, progress));
  }));
  let readingNotion = false;
  app.post("/api/notion/import/preview", route(async (req, res) => {
    if (readingNotion) throw new VaultError(429, "A Notion preview is already being prepared. Please wait.");
    readingNotion = true;
    const controller = new AbortController();
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", cancel); res.setHeader("Cache-Control", "no-store");
    return importResponse(req, res, async progress => {
      try {
        progress({ phase: "reading", completed: 0, step: "Checking the local vault for existing Notion page links" });
        const existingPages = await vault.notionImportTargets();
        controller.signal.throwIfAborted();
        const plan = await prepareNotionImport(req.body, { ...options.notionImportTransport, signal: controller.signal, onProgress: progress, existingPages });
        for (const [key, value] of imports) if (value.expires < Date.now()) imports.delete(key);
        if (imports.size >= 3) imports.delete(imports.keys().next().value!);
        imports.set(plan.id, { plan, expires: Date.now() + 30 * 60_000 });
        return { ...importSummary(plan), documents: plan.pages.map(p => ({ id: p.id, title: p.metadata.title, source: p.source })) };
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name))
          throw new VaultError(504, "Notion preview timed out. Select a smaller page tree and retry.");
        throw error;
      } finally {
        if (req.body && typeof req.body === "object") delete req.body.token;
        readingNotion = false; res.off("close", cancel);
      }
    });
  }));
  app.get('/api/people', route(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.json(await vault.people.list(req.query.includeDeleted === 'true'));
  }));
  app.post('/api/people', route(async (req, res) => res.status(201).json(await vault.people.create(req.body))));
  app.get('/api/people/:id', route(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.json(await vault.people.get(String(req.params.id)));
  }));
  app.put('/api/people/:id', route(async (req, res) => {
    const { baseRevision, ...input } = req.body ?? {};
    return res.json(await vault.people.update(String(req.params.id), input, baseRevision));
  }));
  const services = contentServices(vault);
  const previews = linkPreviews(vault);
  const webBookmarks = bookmarks();
  app.post('/api/bookmarks/resolve', route(async (req, res) => { res.setHeader('Cache-Control', 'no-store'); return res.json(await webBookmarks.resolve(req.body)); }));
  app.get('/api/link-previews/settings', route(async (_req, res) => { res.setHeader('Cache-Control', 'no-store'); return res.json(await previews.settings()); }));
  app.put('/api/link-previews/settings', route(async (req, res) => res.json(await previews.configure(req.body))));
  app.post('/api/link-previews/resolve', route(async (req, res) => { res.setHeader('Cache-Control', 'no-store'); return res.json(await previews.resolve(req.body)); }));
  app.post('/api/link-previews/viewer', route(async (req, res) => { res.setHeader('Cache-Control', 'no-store'); return res.json(await previews.viewer(req.body)); }));
  app.get('/api/services/settings', route(async (_req, res) => res.json(await services.settings())));
  app.put('/api/services/settings', route(async (req, res) => res.json(await services.configure(req.body))));
  app.post('/api/services/generate', route(async (req, res) => res.json(await services.generate(req.body))));
  app.post('/api/services/transcribe', route(async (req, res) => res.json(await services.transcribe(req.body))));
  app.post('/api/syntax/transclusion',route(async(req,res)=>res.json(await files.transclusion(req.body.path,req.body.config))));
  app.post('/api/syntax/bibliography',route(async(req,res)=>{const file=await files.read(req.body.path);return res.json({entries:bibliographyEntries(file.raw)});}));
  app.post('/api/syntax/citations', route(async (req, res) => {
    const input = z.object({ path: z.string().max(500), style: z.string().max(500).default(""), citations: z.array(z.string().min(1).max(2000)).max(200) }).strict().safeParse(req.body);
    if (!input.success) throw new VaultError(400, "Invalid citation request");
    const bibliography = await files.read(input.data.path), style = input.data.style ? (await files.read(input.data.style)).raw : undefined;
    res.json(await renderCitations(bibliography.raw, input.data.citations, style));
  }));

  app.get("/api/markdown/capabilities", route(async (_req, res) => res.json(await getMarkdownLabCapabilities())));
  app.post("/api/markdown/preview", route(async (req, res) => {
    const controller = new AbortController();
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", cancel);
    try { return res.json(await renderPreview(req.body, controller.signal)); }
    finally { res.off("close", cancel); }
  }));

  app.get(
    "/api/status",
    route(async (_req, res) => {
      await vault.init();
      return res.json({
        status: "ok",
        vaultPath: vault.vaultPath,
        vaultManagement: !!options.vaultManagement,
        storage: "markdown",
        sync: "local-only",
        capabilities: { pageActions: 1, sidebarDrag: 1, databases: 1, systemRecycleBin: process.platform === "win32" || !!options.recycleFile },
      });
    }),
  );
  app.get(
    "/api/pages",
    route(async (req, res) => res.json(await vault.list({ includeTrashed: req.query.includeTrashed === "true" }))),
  );
  app.post(
    "/api/pages",
    route(async (req, res) =>
      res.status(201).json(await vault.create(req.body)),
    ),
  );
  app.get(
    "/api/pages/:id",
    route(async (req, res) => res.json(await vault.get(String(req.params.id)))),
  );
  app.get("/api/pages/:id/source-file", route(async (req, res) => {
    const file = await vault.sourceFile(String(req.params.id));
    res.setHeader("Cache-Control", "no-store");
    return res.json({ path: file.path });
  }));
  app.get("/api/pages/:id/source", route(async (req, res) => {
    const file = await vault.sourceFile(String(req.params.id));
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    return res.type("text/plain").send(file.source);
  }));
  app.post("/api/pages/:id/source-file/open", route(async (req, res) => {
    if (!z.object({}).strict().safeParse(req.body).success)
      throw new VaultError(400, "This action accepts only a page ID, not a file path.");
    const file = await vault.sourceFile(String(req.params.id));
    try { await (options.openFile ?? openFile)(file.path); }
    catch { throw new VaultError(503, "Could not open the source file. Check the default Markdown app, or copy the file path and open it manually."); }
    return res.json({ opened: true });
  }));
  app.post(
    "/api/pages/:id/duplicate",
    route(async (req, res) => res.status(201).json(await vault.duplicate(String(req.params.id), req.body?.baseRevision))),
  );
  app.post(
    "/api/pages/:id/recycle",
    route(async (req, res) => res.json(await vault.recycle(String(req.params.id), req.body?.baseRevision, req.body?.baseRevisions))),
  );
  app.post(
    "/api/pages/:id/move",
    route(async (req, res) => { const { baseRevision, ...input } = req.body ?? {}; return res.json(await vault.move(String(req.params.id), input, baseRevision)); }),
  );
  app.put(
    "/api/pages/:id",
    route(async (req, res) => {
      const { baseRevision, ...input } = req.body ?? {};
      return res.json(
        await vault.update(String(req.params.id), input, baseRevision, req.body?.schemaRevision),
      );
    }),
  );
  app.get(
    "/api/conflicts",
    route(async (_req, res) => res.json(await vault.listConflicts())),
  );
  app.post(
    "/api/conflicts/:id/resolve",
    route(async (req, res) => {
      const { baseRevision, ...input } = req.body ?? {};
      return res.json(
        await vault.resolveConflict(String(req.params.id), input, baseRevision, req.body?.schemaRevision),
      );
    }),
  );
  app.get("/api/assets", route(async (_req, res) => { res.setHeader("Cache-Control", "no-store"); return res.json(await vault.listAssets()); }));
  app.post(
    "/api/assets",
    route(async (req, res) => {
      const { name, contentType, data } = req.body ?? {};
      return res
        .status(201)
        .json(await vault.uploadAsset(name, contentType, data));
    }),
  );
  app.use(
    "/assets",
    (req, res, next) => {
      void (async () => {
        await vault.init();
        let relative: string;
        try {
          relative = decodeURIComponent(req.path);
        } catch {
          res.status(400).end();
          return;
        }
        const filename = path.resolve(vault.assetsPath, `.${relative}`);
        const inside = path.relative(vault.assetsPath, filename);
        if (!inside || inside.startsWith("..") || path.isAbsolute(inside)) {
          res.status(404).end();
          return;
        }
        const directory = await fs.lstat(vault.assetsPath);
        if (directory.isSymbolicLink()) {
          res.status(404).end();
          return;
        }
        try {
          let target = vault.assetsPath;
          const parts = inside.split(path.sep);
          for (let i = 0; i < parts.length; i++) {
            target = path.join(target, parts[i]);
            const stat = await fs.lstat(target);
            if (parts[i].startsWith(".") || stat.isSymbolicLink() || (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) {
              res.status(404).end(); return;
            }
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            res.status(404).end();
            return;
          }
          throw error;
        }
        next();
      })().catch(next);
    },
    express.static(vault.assetsPath, {
      dotfiles: "deny",
      index: false,
      setHeaders(res, file) {
        // HTML previews remain sandboxed even when opened outside the editor.
        if (
          !/\.(png|jpe?g|gif|webp|avif|mp3|ogg|wav|m4a|mp4|webm|pdf|html?)$/i.test(file)
        ) {
          res.setHeader("Content-Disposition", "attachment");
        }
        res.setHeader("Content-Security-Policy", /\.html?$/i.test(file) ? "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox" : /\.pdf$/i.test(file) ? "default-src 'none'; script-src 'none'; object-src 'self'" : "default-src 'none'; sandbox");
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    }),
  );
  app.use("/api", (_req, res) => res.status(404).json({ error: "API endpoint not found" }));
  if (options.frontendDir) {
    const directory = path.resolve(options.frontendDir);
    app.use(express.static(directory));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/assets/")) {
        next();
        return;
      }
      res.sendFile(path.join(directory, "index.html"), (error) => {
        if (error) next(error);
      });
    });
  }
  app.use(
    (
      error: Error & { status?: number; type?: string },
      _req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      if (error instanceof PreviewError) {
        if (!res.destroyed) res.status(error.status).json({ error: error.message });
        return;
      }
      if (error instanceof VaultError) {
        res
          .status(error.status)
          .json({ error: error.message, ...error.details });
        return;
      }
      if (error instanceof WebDavError) {
        res.status(error.status >= 400 && error.status < 600 ? error.status : 502)
          .json({ error: error.message, ...(error.retryAt ? { retryAt: error.retryAt } : {}) });
        return;
      }
      if (error.type === "entity.too.large") {
        res.status(413).json({ error: "Request exceeds size limit" });
        return;
      }
      if (error instanceof SyntaxError && error.status === 400) {
        res.status(400).json({ error: "Invalid JSON" });
        return;
      }
      console.error(error);
      res
        .status(500)
        .json({ error: "Local file operation failed. Original files are preserved; check the server logs." });
    },
  );
  return app;
}
