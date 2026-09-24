import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { dialects } from "../src/markdown-engine/config.js";

function localApiOrigin(raw: string): string {
  const url = new URL(raw);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "NOTE_API_URL must be a loopback HTTP(S) origin, e.g. http://127.0.0.1:4318",
    );
  }
  // Avoid resolving the name through a user-modified DNS configuration.
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url.origin;
}

function result(
  payload: Record<string, unknown>,
  isError = false,
): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    ...(isError ? { isError: true } : {}),
  };
}

/** MCP only delegates to the vault HTTP API; it never accesses source files. */
export function createNoteMcpServer(
  apiUrl = process.env.NOTE_API_URL ?? "http://127.0.0.1:4318",
): McpServer {
  const origin = localApiOrigin(apiUrl);
  const server = new McpServer({ name: "notdown-notes", version: "0.1.0" });
  const pageId = z
    .string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/)
    .describe("The immutable page id returned by list_pages or create_page");
  const fields = {
    syntax: z
      .object({
        version: z.literal(1),
        variant: z.enum(dialects.map((v) => v.id)),
        extensions: z.record(
          z.string().regex(/^[a-z][a-z_0-9]{0,100}$/),
          z.boolean(),
        ),
      })
      .passthrough()
      .nullable()
      .optional()
      .describe(
        "Versioned native Markdown variant and extension overrides. Preserve unknown fields. When changing syntax, submit the complete body and matching bodyFormat in the same CAS update. Null restores the bodyFormat default.",
      ),
    title: z.string().min(1).max(500).optional(),
    parent: pageId
      .nullable()
      .optional()
      .describe("Parent page id; null makes this a root page"),
    icon: z.string().max(100).optional(),
    properties: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("When supplied, replaces the complete properties map"),
    body: z
      .string()
      .optional()
      .describe(
        "Complete Markdown file, including any existing YAML or Pandoc title block. Common page metadata is stored in vault metadata.json; document metadata overrides it. Do not add an application YAML header. New pages use Notion Enhanced Markdown: one newline per block, tabs for children, <br> inside a block, <columns>/<column>, <page>, <mention-page>, media tags. Preserve <unknown> and unknown markup. Read bodyFormat before editing legacy pages; omitted fields stay unchanged.",
      ),
    bodyFormat: z
      .enum(["markdown", "notion-markdown"])
      .optional()
      .describe(
        "New pages default to notion-markdown. On update preserve the read format, or convert the complete body before changing it. Do not mix CommonMark and Notion newline semantics.",
      ),
  };

  async function request(
    method: string,
    endpoint: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<CallToolResult> {
    try {
      const response = await fetch(`${origin}${endpoint}`, {
        method,
        redirect: "error",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
          : AbortSignal.timeout(15_000),
        ...(body === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const details =
          payload && typeof payload === "object" && !Array.isArray(payload)
            ? (payload as Record<string, unknown>)
            : { error: String(payload) };
        return result(
          {
            ...details,
            status: response.status,
            ...(response.status === 409
              ? {
                  instruction:
                    "The proposed edit is preserved as a conflict branch. Do not blindly retry with a newer revision. Read the current page and review or merge the branch explicitly.",
                }
              : {}),
          },
          true,
        );
      }
      if (method === "GET" && endpoint === "/api/pages") {
        if (!Array.isArray(payload))
          throw new Error("Page API returned an invalid page list");
        const pages = payload.map(
          ({ body: _body, ...summary }: Record<string, unknown>) => summary,
        );
        return result({ pages });
      }
      return result({ page: payload });
    } catch (error) {
      return result(
        {
          error: error instanceof Error ? error.message : String(error),
          instruction:
            method === "GET"
              ? "Ensure the local Markdown vault API is running, then retry the read."
              : "The write outcome may be unknown. Read/list pages before retrying; do not blindly repeat creation or overwrite a newer revision.",
        },
        true,
      );
    }
  }

  server.registerTool(
    "list_pages",
    {
      description:
        "List local Markdown page metadata and revisions. Read a selected page with read_page to retrieve its body.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_args, extra) =>
      request("GET", "/api/pages", undefined, extra.signal),
  );

  server.registerTool(
    "read_page",
    {
      description:
        "Read the exact Markdown body, page metadata, and current revision. Keep this revision for an update based on this read.",
      inputSchema: { id: pageId },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ id }, extra) =>
      request(
        "GET",
        `/api/pages/${encodeURIComponent(id)}`,
        undefined,
        extra.signal,
      ),
  );

  server.registerTool(
    "create_page",
    {
      description:
        "Create a local Markdown page, optionally under an existing parent page. Returns its generated id and revision.",
      inputSchema: fields,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, extra) => request("POST", "/api/pages", input, extra.signal),
  );

  server.registerTool(
    "update_page",
    {
      description:
        "Update selected page fields using the baseRevision from the read on which this edit is based. A stale revision preserves the proposed edit as a conflict branch and returns an error; it never silently overwrites the current page.",
      inputSchema: {
        id: pageId,
        baseRevision: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .describe(
            "SHA-256 revision returned by the read used to prepare this edit; required",
          ),
        ...fields,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ id, ...input }, extra) =>
      request(
        "PUT",
        `/api/pages/${encodeURIComponent(id)}`,
        input,
        extra.signal,
      ),
  );

  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await createNoteMcpServer().connect(new StdioServerTransport());
  } catch (error) {
    // stdout is exclusively newline-delimited MCP JSON-RPC messages.
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
