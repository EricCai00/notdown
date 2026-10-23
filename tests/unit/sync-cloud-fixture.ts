import { PGlite } from "@electric-sql/pglite";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";

export const syncTestAccount = { email: "sync@example.invalid", password: "isolated-test-password" };
export const syncTestKey = "sb_publishable_notdown_test_only";
export const syncUserA = "10000000-0000-4000-8000-000000000001";
export const syncUserB = "10000000-0000-4000-8000-000000000002";

/** Executes the production SQL in PostgreSQL/WASM; only Auth and blob HTTP delivery are test adapters. */
export async function createSyncCloudFixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key);
    insert into auth.users values ('${syncUserA}'), ('${syncUserB}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint);
    create table storage.objects(bucket_id text, name text, primary key(bucket_id, name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated; grant select, insert on storage.objects to authenticated;
  `);
  const schema = await fs.readFile(new URL("../../server/sync/supabase.sql", import.meta.url), "utf8");
  await db.exec(schema);
  async function asUser<T>(user: string, sql: string, args: unknown[] = []) {
    return db.transaction(async tx => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
      return tx.query<T>(sql, args);
    });
  }
  const tokens = new Map<string, string>(), blobs = new Map<string, Buffer>();
  const app = express();
  app.use((req, res, next) => { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "authorization,apikey,content-type,x-upsert"); res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS"); if (req.method === "OPTIONS") { res.sendStatus(204); return; } next(); });
  app.use(express.json({ limit: "20mb" }));
  app.use(express.raw({ type: "application/octet-stream", limit: "1mb" }));
  app.post("/auth/v1/token", (req, res) => {
    const previous = tokens.get(req.body.refresh_token);
    const user = req.query.grant_type === "refresh_token" ? previous : req.body.password === syncTestAccount.password
      ? req.body.email === syncTestAccount.email ? syncUserA : req.body.email === "second@example.invalid" ? syncUserB : undefined : undefined;
    if (!user) { res.status(401).json({ message: "Invalid test credentials" }); return; }
    const access_token = randomUUID(), refresh_token = randomUUID(); tokens.set(access_token, user); tokens.set(refresh_token, user);
    res.json({ access_token, refresh_token, expires_in: 3600, user: { id: user, email: req.body.email ?? syncTestAccount.email } });
  });
  app.use((req, res, next) => { const user = tokens.get(req.headers.authorization?.replace(/^Bearer /, "") ?? ""); if (!user || req.headers.apikey !== syncTestKey) { res.status(401).json({ message: "Sign in first" }); return; } res.locals.user = user; next(); });
  const rpcArgs: Record<string, string[]> = { nd_sync_vaults: [], nd_sync_create_vault: ["p_id", "p_name"], nd_sync_pull: ["p_vault", "p_cursor", "p_limit"], nd_sync_push: ["p_vault", "p_operation", "p_mutations"] };
  app.post("/rest/v1/rpc/:name", async (req, res) => {
    try {
      const keys = rpcArgs[req.params.name]; if (!keys) { res.sendStatus(404); return; }
      const args = keys.map(key => typeof req.body[key] === "object" ? JSON.stringify(req.body[key]) : req.body[key]);
      const result = await asUser<{ result: unknown }>(res.locals.user, `select public.${req.params.name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as result`, args);
      res.json(result.rows[0].result);
    } catch (error) { res.status(400).json({ message: (error as Error).message }); }
  });
  app.all(/^\/storage\/v1\/object\/notdown-sync\/(.+)$/, async (req, res) => {
    const name = req.params[0];
    try {
      if (req.method === "POST") {
        if (!Buffer.isBuffer(req.body)) throw new Error("Expected binary blob");
        await asUser(res.locals.user, "insert into storage.objects(bucket_id,name) values ('notdown-sync',$1)", [name]);
        blobs.set(name, Buffer.from(req.body)); res.json({ Key: name });
      } else if (req.method === "GET") {
        const result = await asUser(res.locals.user, "select name from storage.objects where bucket_id = 'notdown-sync' and name = $1", [name]);
        if (!result.rows.length || !blobs.has(name)) { res.sendStatus(404); return; }
        res.type("application/octet-stream").send(blobs.get(name));
      } else res.sendStatus(405);
    } catch (error) { res.status(400).json({ message: (error as Error).message }); }
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  return { db, asUser, schema, blobs, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await db.close(); } };
}
