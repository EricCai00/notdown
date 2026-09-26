import { editorKind } from "../../src/document/node-identity";
import assert from "node:assert/strict";
import test from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { linkTarget } from "../../src/features/links/link-preview";
import { linkPreviews } from "../../server/link-previews";
import { createVault } from "../../server/vault";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { defaultSyntax } from "../../src/markdown-engine/config";
import { EditorState } from "prosemirror-state";

async function fixture(
  run: (
    services: ReturnType<typeof linkPreviews>,
    calls: { url: string; init?: RequestInit }[],
  ) => Promise<void>,
  response: (url: string) => Response | Promise<Response>,
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-preview-"));
  try {
    const calls: { url: string; init?: RequestInit }[] = [];
    const services = linkPreviews(createVault(root), (async (url, init) => {
      calls.push({ url: String(url), init });
      return response(String(url));
    }) as typeof fetch);
    await run(services, calls);
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert(path.basename(root).startsWith("notdown-preview-"));
    await fs.rm(root, { recursive: true, force: true });
  }
}
test("provider matching rejects spoofed hosts and unsupported GitHub paths", () => {
  assert.equal(
    linkTarget("https://github.com/acme/repo/pull/42")?.label,
    "Pull Request #42",
  );
  assert.equal(
    linkTarget("https://acme.sharepoint.com/:w:/s/team/a")?.provider,
    "onedrive",
  );
  assert.equal(linkTarget("https://1drv.ms/w/s!file")?.provider, "onedrive");
  assert.equal(
    linkTarget("https://github.com/acme/repo/blob/main/a.ts#L3-L5")?.end,
    5,
  );
  for (const url of [
    "http://github.com/acme/repo",
    "https://github.com.evil.com/acme/repo",
    "https://github.com@evil.com/acme/repo",
    "https://user:secret@github.com/acme/repo",
    "https://evilsharepoint.com/file",
    "https://github.com/acme/repo/actions",
    "https://github.com/acme/repo/blob/main/a#L5-L3",
    "https://github.com:444/acme/repo",
    "javascript:alert(1)",
  ])
    assert.equal(linkTarget(url), undefined, url);
});
test("disconnect invalidates a request already in flight and never caches its old data", async () => {
  let release!: () => void, started!: () => void;
  const wait = new Promise<void>(resolve => release = resolve);
  const received = new Promise<void>(resolve => started = resolve);
  await fixture(async services => {
    await services.configure({ provider: "github", token: "old-token" });
    const pending = services.resolve({ url: "https://github.com/acme/repo" });
    await received;
    await services.configure({ provider: "github", disconnect: true });
    const rejected = assert.rejects(pending, /Connection changed/); release(); await rejected;
    assert.deepEqual(await services.settings(), { github: false, onedrive: false });
  }, async () => { started(); await wait; return Response.json({ name: "Private title" }); });
});
test("GitHub API uses fixed hosts, caches results and never exposes credentials", async () => {
  await fixture(
    async (services, calls) => {
      await services.configure({ provider: "github", token: "private-token" });
      assert.deepEqual(await services.settings(), {
        github: true,
        onedrive: false,
      });
      const data = await services.resolve({
        url: "https://github.com/acme/repo/pull/42",
      });
      assert.equal(data.state, "Merged");
      assert.equal(data.title, "Improve caching");
      assert.equal(
        calls[0].url,
        "https://api.github.com/repos/acme/repo/pulls/42",
      );
      assert.equal(
        (calls[0].init?.headers as Record<string, string>).Authorization,
        "Bearer private-token",
      );
      assert.equal(calls[0].init?.redirect, "error");
      assert(!JSON.stringify(data).includes("private-token"));
      await services.resolve({ url: "https://github.com/acme/repo/pull/42" });
      assert.equal(calls.length, 1);
      await services.configure({ provider: "github", disconnect: true });
      await services.resolve({ url: "https://github.com/acme/repo/pull/42" });
      assert.equal(calls.length, 2);
      assert.equal(
        (calls[1].init?.headers as Record<string, string>).Authorization,
        undefined,
      );
      await assert.rejects(
        services.resolve({ url: "https://127.0.0.1/secrets" }),
        /Use a GitHub/,
      );
    },
    () =>
      Response.json({
        title: "Improve caching",
        state: "closed",
        merged_at: "2026-09-22",
        user: { login: "eric", avatar_url: "javascript:alert(1)" },
      }),
  );
});
test("code permalinks select lines and enforce preview boundaries", async () => {
  await fixture(
    async (services, calls) => {
      const data = await services.resolve({
        url: "https://github.com/acme/repo/blob/feature%2Fcache/src/file.ts#L2-L3",
      });
      assert.equal(data.code, "two\nthree");
      assert.equal(data.start, 2);
      assert.equal(
        calls[0].url,
        "https://api.github.com/repos/acme/repo/contents/src/file.ts?ref=feature%2Fcache",
      );
      await assert.rejects(
        services.resolve({
          url: "https://github.com/acme/repo/blob/main/a#L7",
        }),
        /line no longer exists/,
      );
    },
    () =>
      Response.json({
        type: "file",
        encoding: "base64",
        content: Buffer.from("one\ntwo\nthree\nfour").toString("base64"),
      }),
  );
});
test("OneDrive shares are encoded and require credentials; viewer stays on Microsoft hosts", async () => {
  await fixture(
    async (services, calls) => {
      const url = "https://1drv.ms/w/s!example";
      await assert.rejects(services.resolve({ url }), /Connect OneDrive/);
      assert.equal(calls.length, 0);
      await services.configure({ provider: "onedrive", token: "graph-token" });
      const data = await services.resolve({ url });
      assert.equal(data.title, "Project.docx");
      assert.equal(data.size, 5120);
      assert(
        calls[0].url.includes("u!" + Buffer.from(url).toString("base64url")),
      );
      assert(!JSON.stringify(data).includes("graph-token"));
      const viewer = await services.viewer({ url });
      assert.match(viewer.url, /^https:\/\/word-view.officeapps.live.com/);
      assert.equal(calls.at(-1)?.init?.method, "POST");
      assert(calls.at(-1)?.url.endsWith("/drives/drive/items/file/preview"));
    },
    (url) =>
      Response.json(
        url.endsWith("/preview")
          ? { getUrl: "https://word-view.officeapps.live.com/view?file=test" }
          : {
              id: "file",
              parentReference: { driveId: "drive" },
              name: "Project.docx",
              size: 5120,
              file: { mimeType: "application/docx" },
              thumbnails: [
                { large: { url: "https://example.com/thumbnail.png" } },
              ],
            },
      ),
  );
});
test("provider error bodies and oversized data are rejected without echoing secrets", async () => {
  await fixture(
    async (services) => {
      await assert.rejects(
        services.resolve({ url: "https://github.com/a/b" }),
        (e) =>
          !String(e).includes("secret-provider-body") &&
          /Connection expired/.test(String(e)),
      );
    },
    () => new Response("secret-provider-body", { status: 401 }),
  );
  await fixture(
    async (services) => {
      await assert.rejects(
        services.resolve({ url: "https://github.com/a/b" }),
        /2 MB limit/,
      );
    },
    () => new Response("x".repeat(2_000_001)),
  );
});
test("mentions and previews round-trip unknown fields after editing and respect disabled dialects and code", () => {
  const config = {
    ...defaultSyntax("notion-markdown"),
    variant: "notdown" as const,
  };
  const source =
    'Before <mention-link url="https://github.com/a/b/issues/1" future="keep">Issue &amp; detail</mention-link> after.\n\n<link-preview url="https://1drv.ms/w/s!file" custom="keep"/>\n\n```\n<mention-link url="x">literal</mention-link>\n```';
  const doc = parseNative(source, config);
  assert.equal(editorKind(doc.firstChild?.child(1)), "link_mention");
  assert.equal(editorKind(doc.child(1)), "link_preview");
  assert.equal(editorKind(doc.child(2)), "code_block");
  assert.equal(serializeNative(doc, config), source);
  const mention = doc.firstChild!.child(1);
  const tr = EditorState.create({ doc }).tr.setNodeMarkup(8, undefined, {
    ...mention.attrs,
    label: "Renamed <item>",
  });
  const output = serializeNative(tr.doc, config);
  assert(output.includes('future="keep"'));
  assert(output.includes("Renamed &lt;item&gt;"));
  assert(output.includes('custom="keep"'));
  assert.equal(
    parseNative(output, config).firstChild?.child(1).attrs.label,
    "Renamed <item>",
  );
  const disabled = parseNative(source, {
    ...config,
    extensions: { notion_link_preview: false },
  });
  let count = 0;
  disabled.descendants((n) => {
    if (["link_mention", "link_preview"].includes(editorKind(n))) count++;
  });
  assert.equal(count, 0);
  const broken = 'Before <mention-link url="https://github.com/a/b">unfinished';
  assert.equal(serializeNative(parseNative(broken, config), config), broken);
});
