import express from "express";
import { contentServices } from "./content-services";
import { linkPreviews } from "./link-previews";
import { bookmarks } from "./bookmarks";
import type { Request, Response, NextFunction } from "express";
import path from "node:path";
import { promises as fs } from "node:fs";
import { createVault, VaultError } from "./vault.js";
import { getMarkdownLabCapabilities, renderPreview, PreviewError, renderCitations } from "./pandoc.js";
import { z } from "zod";
import {syntaxFiles} from './syntax-files.js';
import {bibliographyEntries} from '../src/markdown-engine/bibliography.js';

export function createApp(options: {
  vaultPath: string;
  frontendDir?: string;
  allowedOrigins?: string[];
  recycleFile?: (filename: string) => Promise<void>;
}) {
  const app = express();
  const vault = createVault(options.vaultPath, { recycleFile: options.recycleFile });
  app.locals.vault = vault;
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
        storage: "markdown",
        sync: "local-only",
        capabilities: { pageActions: 1, sidebarDrag: 1, systemRecycleBin: process.platform === "win32" || !!options.recycleFile },
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
        await vault.update(String(req.params.id), input, baseRevision),
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
        await vault.resolveConflict(String(req.params.id), input, baseRevision),
      );
    }),
  );
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
        if (path.dirname(filename) !== vault.assetsPath) {
          res.status(404).end();
          return;
        }
        const directory = await fs.lstat(vault.assetsPath);
        if (directory.isSymbolicLink()) {
          res.status(404).end();
          return;
        }
        try {
          const stat = await fs.lstat(filename);
          if (!stat.isFile() || stat.isSymbolicLink()) {
            res.status(404).end();
            return;
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
        // Browser-active documents are downloaded. Uploaded names cannot select an executable suffix.
        if (
          !/\.(png|jpe?g|gif|webp|avif|mp3|ogg|wav|m4a|mp4|webm|pdf)$/i.test(file)
        ) {
          res.setHeader("Content-Disposition", "attachment");
        }
        res.setHeader("Content-Security-Policy", /\.pdf$/i.test(file) ? "default-src 'none'; script-src 'none'; object-src 'self'" : "default-src 'none'; sandbox");
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
