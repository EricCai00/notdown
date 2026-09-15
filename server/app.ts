import express from "express";
import type { Request, Response, NextFunction } from "express";
import path from "node:path";
import { promises as fs } from "node:fs";
import { createVault, VaultError } from "./vault.js";

export function createApp(options: {
  vaultPath: string;
  frontendDir?: string;
  allowedOrigins?: string[];
}) {
  const app = express();
  const vault = createVault(options.vaultPath);
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
      res.status(403).json({ error: "只允许通过本机地址访问" });
      return;
    }
    const origin = req.get("origin");
    const sameOrigin = origin === `${req.protocol}://${req.get("host")}`;
    if (origin && !sameOrigin && !origins.has(origin)) {
      res.status(403).json({ error: "不允许此来源访问本地知识库" });
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
      res.status(415).json({ error: "写入请求必须使用 application/json" });
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

  app.get(
    "/api/status",
    route(async (_req, res) => {
      await vault.init();
      return res.json({
        status: "ok",
        vaultPath: vault.vaultPath,
        storage: "markdown",
        sync: "local-only",
      });
    }),
  );
  app.get(
    "/api/pages",
    route(async (_req, res) => res.json(await vault.list())),
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
          !/\.(png|jpe?g|gif|webp|avif|mp3|ogg|wav|m4a|mp4|webm)$/i.test(file)
        ) {
          res.setHeader("Content-Disposition", "attachment");
        }
        res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    }),
  );
  app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在" }));
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
      if (error instanceof VaultError) {
        res
          .status(error.status)
          .json({ error: error.message, ...error.details });
        return;
      }
      if (error.type === "entity.too.large") {
        res.status(413).json({ error: "请求超过大小限制" });
        return;
      }
      if (error instanceof SyntaxError && error.status === 400) {
        res.status(400).json({ error: "JSON 格式不合法" });
        return;
      }
      console.error(error);
      res
        .status(500)
        .json({ error: "本地文件操作失败，原文件已保留；请检查服务器日志" });
    },
  );
  return app;
}
