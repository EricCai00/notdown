import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { htmlDocument } from "../../src/document/document-format";
import { insertMenuItems } from "../../src/editor/insert-menu";
import { commandEnabled, type SyntaxConfig } from "../../src/markdown-engine/config";

const config: SyntaxConfig = { version: 1, variant: "notdown", extensions: {} };

test("Notdown offers a separate GitHub-style Alert alongside Notion Callout", () => {
  const items = insertMenuItems(config);
  assert.equal(items.find(item => item[0] === "alert")?.[2], "GitHub-style Alert");
  assert.equal(items.find(item => item[0] === "alert")?.[5], "Markdown blocks");
  assert.equal(items.find(item => item[0] === "callout")?.[2], "Callout");
  assert(!insertMenuItems({ ...config, extensions: { alerts: false } }).some(item => item[0] === "alert"));
  assert(insertMenuItems({ ...config, extensions: { alerts: false } }).some(item => item[0] === "callout"));
  assert(!insertMenuItems({ ...config, variant: "notion-markdown" }).some(item => item[0] === "alert"));
  assert(!insertMenuItems(config, true).some(item => item[0] === "alert"));
});

test("alert exports use semantic colors, library SVGs and readable labels without changing Markdown", () => {
  for (const [kind, color] of [["NOTE", "#0969da"], ["TIP", "#1a7f37"], ["IMPORTANT", "#8250df"], ["WARNING", "#9a6700"], ["CAUTION", "#cf222e"]]) {
    const source = `> [!${kind}]\r\n> Body`;
    const html = htmlDocument("Alerts", source, [], "notion-markdown", config);
    assert(html.includes(`--alert-color:${color}`));
    assert(html.includes(`<span class="pm-alert-title-text">${kind[0] + kind.slice(1).toLowerCase()}</span>`));
    assert.match(html, /<svg[^>]*class="pm-alert-icon"[^>]*aria-hidden="true"[^>]*><path d="M/);
    assert(!html.includes("<http://"));
    assert.equal(serializeNative(parseNative(source, config), config), source);
  }
});

test("Notdown preserves custom alert titles, folding and unknown types through body edits", () => {
  for (const kind of ["NOTE", "custom-kind"]) for (const fold of ["", "+", "-"]) {
    const source = `> [!${kind}]${fold} <b>Title</b>\r\n> Body`;
    const doc = parseNative(source, config);
    let end = 0;
    doc.descendants((node, pos) => { if (node.isText && node.text === "Body") end = pos + 4; });
    const changed = EditorState.create({ doc }).tr.insertText(" edited", end).doc;
    const written = serializeNative(changed, config);
    const reopened = parseNative(written, config).firstChild!;
    assert.equal(reopened.attrs.kind, kind);
    assert.equal(reopened.attrs.title, "<b>Title</b>");
    assert.equal(reopened.attrs.fold, fold);
    assert.equal(reopened.textContent, "Body edited");
    const html = htmlDocument("Alerts", written, [], "notion-markdown", config);
    assert(html.includes("&lt;b&gt;Title&lt;/b&gt;"));
    assert.equal(html.includes('<details class="pm-callout pm-alert"'), !!fold);
    assert.equal(/<details[^>]* open=""/.test(html), fold === "+");
    assert.equal(html.includes('class="pm-alert-fold"'), !!fold);
    assert(!html.includes('class="pm-alert-title-input"'));
  }
});

test("inline alert title editing is limited to dialects with custom title syntax", () => {
  for (const variant of ["notdown", "obsidian", "gfm", "typora", "commonmark", "markdown", "notion-markdown"] as const) {
    const c = { ...config, variant, extensions: { alerts: true } };
    assert.equal(commandEnabled(c, "alert_title"), ["notdown", "obsidian"].includes(variant));
    assert(!commandEnabled({ ...c, extensions: { alerts: false } }, "alert_title"));
  }
});


test("Obsidian keywords and aliases stay inside Obsidian and Notdown with profile colors", () => {
  const groups: [string[], string][] = [
    [["NOTE", "INFO", "TODO"], "#086ddd"], [["ABSTRACT", "SUMMARY", "TLDR", "TIP", "HINT", "IMPORTANT"], "#00bfbc"],
    [["SUCCESS", "CHECK", "DONE"], "#08b94e"], [["QUESTION", "HELP", "FAQ", "WARNING", "CAUTION", "ATTENTION"], "#ec7500"],
    [["FAILURE", "FAIL", "MISSING", "DANGER", "ERROR", "BUG"], "#e93147"], [["EXAMPLE"], "#7852ee"], [["QUOTE", "CITE"], "#9e9e9e"],
  ];
  const github: Record<string, string> = { NOTE: "#0969da", TIP: "#1a7f37", IMPORTANT: "#8250df", WARNING: "#9a6700", CAUTION: "#cf222e" };
  for (const [types, color] of groups) for (const kind of types) {
    for (const variant of ["obsidian", "notdown"] as const) {
      const c = { ...config, variant };
      const source = `> [!${kind.toLowerCase()}]- Title\n> Body`;
      const doc = parseNative(source, c);
      assert.equal(doc.firstChild!.attrs.kind, kind.toLowerCase());
      assert.equal(serializeNative(doc, c), source);
      assert(htmlDocument("Alert", source, [], "markdown", c).includes(`--alert-color:${variant === "notdown" ? github[kind] || color : color}`));
    }
    for (const variant of ["gfm", "typora", "commonmark", "markdown", "notion-markdown"] as const) {
      const c = { ...config, variant, extensions: { alerts: true } };
      const source = `> [!${kind}]\n> Body`;
      const doc = parseNative(source, c);
      assert.equal(doc.firstChild!.attrs.syntaxForm === "alert", variant !== "notion-markdown" && !!github[kind]);
      assert.equal(serializeNative(doc, c), source);
    }
  }
});
