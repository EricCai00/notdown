import assert from "node:assert/strict";
import { once } from "node:events";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createApp } from "../../server/app.js";
import { createNoteMcpServer } from "../../server/mcp.js";
import type { Page } from "../../server/vault.js";

test("MCP refuses remote origins and URLs carrying credentials or alternate paths", () => {
  for (const url of [
    "https://example.com",
    "http://127.0.0.1@evil.test",
    "http://user:pass@127.0.0.1:4318",
    "file:///tmp",
    "http://127.0.0.1:4318/api",
  ]) {
    assert.throws(() => createNoteMcpServer(url));
  }
});

test(
  "genuine stdio MCP initializes and preserves a stale update as a conflict",
  { timeout: 30_000 },
  async (context) => {
    const temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "note-mcp-test-"),
    );
    const app = createApp({ vaultPath: temporaryRoot });
    const http = app.listen(0, "127.0.0.1");
    const client = new Client({ name: "note-mcp-test", version: "1.0.0" });
    context.after(async () => {
      await client.close();
      await new Promise<void>((resolve, reject) =>
        http.close((error) => (error ? reject(error) : resolve())),
      );
      const resolved = path.resolve(temporaryRoot);
      assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
      assert.ok(path.basename(resolved).startsWith("note-mcp-test-"));
      await fs.rm(resolved, { recursive: true, force: true });
    });
    await once(http, "listening");
    const address = http.address() as AddressInfo;
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", "server/mcp.ts"],
      cwd: fileURLToPath(new URL("../..", import.meta.url)),
      env: { ...environment, NOTE_API_URL: `http://127.0.0.1:${address.port}` },
      stderr: "pipe",
    });
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      "create_page",
      "list_pages",
      "read_page",
      "update_page",
    ]);
    assert.ok(
      tools
        .find((tool) => tool.name === "update_page")
        ?.inputSchema.required?.includes("baseRevision"),
    );

    const created = await client.callTool({
      name: "create_page",
      arguments: { title: "MCP 测试", body: "Original Markdown" },
    });
    assert.notEqual(created.isError, true);
    const first = (created.structuredContent as { page: Page }).page;
    const listed = await client.callTool({ name: "list_pages", arguments: {} });
    assert.equal(
      (listed.structuredContent as { pages: Page[] }).pages[0].id,
      first.id,
    );
    assert.ok(
      !("body" in (listed.structuredContent as { pages: object[] }).pages[0]),
    );
    const read = await client.callTool({
      name: "read_page",
      arguments: { id: first.id },
    });
    assert.equal(
      (read.structuredContent as { page: Page }).page.body,
      "Original Markdown",
    );

    const updated = await client.callTool({
      name: "update_page",
      arguments: {
        id: first.id,
        baseRevision: first.revision,
        body: "Current Markdown",
      },
    });
    assert.notEqual(updated.isError, true);
    const conflict = await client.callTool({
      name: "update_page",
      arguments: {
        id: first.id,
        baseRevision: first.revision,
        body: "Proposed Markdown",
      },
    });
    assert.equal(conflict.isError, true);
    const fork = conflict.structuredContent as {
      status: number;
      conflictId: string;
      current: Page;
      proposed: Page;
    };
    assert.equal(fork.status, 409);
    assert.equal(fork.current.body, "Current Markdown");
    assert.equal(fork.proposed.body, "Proposed Markdown");
    assert.ok(fork.conflictId);
    const conflicts = await app.locals.vault.listConflicts();
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].conflictId, fork.conflictId);
    assert.equal(
      (await app.locals.vault.get(first.id)).body,
      "Current Markdown",
    );
  },
);
