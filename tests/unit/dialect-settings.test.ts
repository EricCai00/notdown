import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { configureDocumentSyntax } from "../../src/markdown-engine/metadata-editing";
import { DocumentSession } from "../../src/markdown-engine/session";
import { normalizeSyntax, resetExtensions, type SyntaxConfig } from "../../src/markdown-engine/config";
import { documentMetadata } from "../../src/features/metadata/document-metadata";
import { createVault } from "../../server/vault";

const original: SyntaxConfig = { version: 1, variant: "obsidian", future: { keep: true }, extensions: { highlight: false, future_extension: true } };
const changed: SyntaxConfig = { ...original, variant: "notdown", extensions: resetExtensions(original) };

test("dialect settings update existing YAML overrides and retain comments, BOM, CRLF and body", () => {
  const body = '\r\n\r\n```future\r\n---\r\nsyntax: untouched\r\n---\r\n```\r\n\r\n<unknown keep="all"/>\r\n';
  const source = '\uFEFF---\r\n# Keep this header comment\r\nsyntax:\r\n  version: 1\r\n  variant: obsidian # Chosen dialect\r\n  future: { keep: true } # Keep this field\r\n  extensions:\r\n    highlight: false\r\n    future_extension: true # Keep this extension\r\nbodyFormat: markdown\r\nother: "keep quotes"\r\n...'+body;
  const next = configureDocumentSyntax(source, changed);
  assert.ok(next.startsWith('\uFEFF---\r\n'));
  assert.ok(next.endsWith('...'+body));
  assert.ok(!/(?<!\r)\n/.test(next));
  for (const comment of ["Keep this header comment", "Chosen dialect", "Keep this field", "Keep this extension"])
    assert.ok(next.includes(comment));
  const values = documentMetadata(next).values;
  assert.deepEqual(values.syntax, changed);
  assert.equal(values.bodyFormat, "notion-markdown");
  assert.equal(values.other, "keep quotes");
  assert.equal(configureDocumentSyntax(next, changed), next);
});

test("dialect settings never synthesize YAML, syntax or bodyFormat overrides", () => {
  for (const source of ["Plain source\n", "% Title\n% Author\n\nText\n", "---\nfuture: true\n---\nText\n", '```yaml\nsyntax: obsidian\n```\n'])
    assert.equal(configureDocumentSyntax(source, changed), source);
  const formatOnly = configureDocumentSyntax("---\nbodyFormat: markdown\nfuture: true\n---\nText\n", changed);
  assert.deepEqual(documentMetadata(formatOnly).values, { bodyFormat: "notion-markdown", future: true });
  const syntaxOnly = configureDocumentSyntax("---\nsyntax: {version: 1, variant: commonmark, extensions: {}}\n---\nText\n", changed);
  assert.equal(Object.hasOwn(documentMetadata(syntaxOnly).values, "bodyFormat"), false);
});

test("dialect settings keep alias definitions and reject malformed YAML boundaries", () => {
  const source = "---\nbase: &base {version: 1, variant: obsidian, future: {keep: true}, extensions: {future_extension: true}}\nsyntax: *base\n---\nTail\n";
  const next = configureDocumentSyntax(source, changed);
  assert.deepEqual(documentMetadata(next).values.base, documentMetadata(source).values.base);
  assert.deepEqual(documentMetadata(next).values.syntax, changed);
  assert.ok(next.endsWith("---\nTail\n"));
  assert.throws(() => configureDocumentSyntax("---\nsyntax: [invalid\n---\nText\n", changed), /Invalid YAML/);
  const literal = "---\nsyntax: {version: 1, variant: obsidian, extensions: {}}\nfuture: |+\n  Keep significant spaces  \n\n\n---\nText\n";
  assert.equal(documentMetadata(configureDocumentSyntax(literal, changed)).values.future, documentMetadata(literal).values.future);
});

test("dialect source overrides participate in one configuration undo and redo", () => {
  const source = "---\nsyntax: {version: 1, variant: obsidian, extensions: {}}\n---\nOriginal body\n";
  const session = new DocumentSession(source, { version: 1, variant: "obsidian", extensions: {} });
  session.configure(changed);
  const configured = session.snapshot.source;
  assert.equal((documentMetadata(configured).values.syntax as SyntaxConfig).variant, "notdown");
  assert.ok(configured.endsWith("---\nOriginal body\n"));
  session.undo(); assert.equal(session.snapshot.source, source); assert.equal(session.snapshot.config.variant, "obsidian");
  session.redo(); assert.equal(session.snapshot.source, configured); assert.equal(session.snapshot.config.variant, "notdown");
});

test("saved dialect changes remain effective when the source declares its own syntax", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "notdown-dialect-settings-"));
  const vault = createVault(root);
  try {
    const source = "---\nsyntax: {version: 1, variant: obsidian, extensions: {}}\nbodyFormat: markdown\nfuture: keep\n---\nText\n";
    const page = await vault.create({ title: "Dialect", body: source, bodyFormat: "markdown", syntax: original });
    const session = new DocumentSession(page.body, page.syntax!);
    session.configure(changed);
    await vault.update(page.id, { body: session.snapshot.source, syntax: session.snapshot.config, bodyFormat: session.format }, page.revision);
    const reopened = await vault.get(page.id);
    assert.deepEqual(reopened.syntax, normalizeSyntax(changed));
    assert.equal(reopened.bodyFormat, "notion-markdown");
    assert.equal(documentMetadata(reopened.body).values.future, "keep");
    assert.ok(reopened.body.endsWith("---\nText\n"));
  } finally {
    vault.closeHistory();
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("notdown-dialect-settings-"));
    await rm(root, { recursive: true, force: true });
  }
});

test("format changes keep JSON defaults coherent when YAML only declares syntax", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "notdown-dialect-settings-"));
  const vault = createVault(root);
  try {
    const source = "---\nsyntax: {version: 1, variant: obsidian, extensions: {}}\nfuture: keep\n---\nText\n";
    let page = await vault.create({ title: "Dialect defaults", body: source, syntax: original, bodyFormat: "markdown" });
    const session = new DocumentSession(page.body, page.syntax!);
    for (const variant of ["gfm", "notdown", "rmarkdown", "quarto"] as const) {
      session.configure({ ...session.snapshot.config, variant });
      page = await vault.update(page.id, { body: session.snapshot.source, syntax: session.snapshot.config, bodyFormat: session.format }, page.revision);
      const reopened = await vault.get(page.id);
      assert.equal(reopened.syntax!.variant, variant);
      assert.equal(reopened.bodyFormat, session.format);
      assert.equal(Object.hasOwn(documentMetadata(reopened.body).values, "bodyFormat"), false);
      assert.ok(reopened.body.endsWith("---\nText\n"));
    }
  } finally {
    vault.closeHistory();
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("notdown-dialect-settings-"));
    await rm(root, { recursive: true, force: true });
  }
});
