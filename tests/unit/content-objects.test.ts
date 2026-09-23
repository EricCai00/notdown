import assert from "node:assert/strict";
import test from "node:test";
import {
  contentObjects,
  contentObject,
  contentCommand,
  getContentCapabilities,
  implementationRoles,
  resolveContentObject,
  resolveMarkObject,
} from "../../src/document/content-objects";
import { blockCatalog } from "../../src/catalog/block-catalog-data";
import { editorSchema as s } from "../../src/document/editor-schema";
import {
  parseNative,
  serializeNative,
  nativeBlockSupported,
} from "../../src/markdown-engine/codec";
import { type SyntaxConfig, type Dialect } from "../../src/markdown-engine/config";
import { EditorState } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { htmlDocument } from "../../src/document/document-format";

const config = (
  variant: Dialect,
  extensions: Record<string, boolean> = {},
): SyntaxConfig => ({ version: 1, variant, extensions });
test("target inventory preserves the supplied object identities plus Inline raw source and separate editing states", () => {
  assert.equal(contentObjects.length, 81);
  assert.equal(new Set(contentObjects.map((o) => o.id)).size, 81);
  assert.deepEqual(
    ["block", "metadata", "inline", "character"].map(
      (c) => contentObjects.filter((o) => o.category === c).length,
    ),
    [43, 2, 32, 4],
  );
  for (const object of contentObjects) {
    assert.equal(object.id.split(".")[0], object.category);
    if (object.status === "planned")
      assert.deepEqual(object.adapters, [], object.id);
  }
  for (const name of Object.keys(s.nodes)) {
    const node = s.nodes[name].createAndFill();
    assert(
      implementationRoles[name] ||
        name === "text" ||
        [
          "syntax_block",
          "syntax_inline",
          "mention",
          "list_item",
          "media_block",
        ].includes(name) ||
        (node && resolveContentObject(node)),
      name,
    );
  }
  for (const name of Object.keys(s.marks))
    assert(resolveMarkObject(s.marks[name].create()), name);
  assert(contentObject("block.paragraph")?.aliases.includes("empty block"));
  assert(
    !contentObject("inline.date_or_reminder")?.aliases.includes(
      "date ot reminder",
    ),
  );
  assert.equal(
    getContentCapabilities("block.tabs", config("notion-markdown")).available,
    false,
  );
  assert.equal(
    getContentCapabilities(
      "block.callout",
      config("typora", { notion_callouts: false, alerts: true }),
    ).available,
    true,
  );
  assert.equal(
    getContentCapabilities(
      "block.callout",
      config("typora", { notion_callouts: false, alerts: false }),
    ).available,
    false,
  );
  assert.equal(contentCommand("callout", config("typora")).label, "Callout");
});

test("every product preview represents the advertised object rather than its carrier", () => {
  for (const entry of blockCatalog.filter((e) => e.sample)) {
    const doc = parseNative(
      entry.sample!,
      config(
        entry.variant,
        Object.fromEntries((entry.extensions || []).map((e) => [e, true])),
      ),
    );
    let found = false;
    doc.descendants((node, _pos, parent) => {
      const object = resolveContentObject(node, {
        parent: parent || undefined,
        pageRole: entry.id === "block.child_page" ? "child" : "reference",
      });
      if (object?.id === entry.id) found = true;
      for (const mark of node.marks)
        if (resolveMarkObject(mark)?.id === entry.id) found = true;
    });
    assert(found, entry.id);
  }
});

test("context resolves tasks, toggle headings, media, image placement and page roles", () => {
  const item = s.nodes.task_list_item.create(
    { checked: true },
    s.nodes.paragraph.create(),
  );
  assert.equal(
    resolveContentObject(item, {
      list: s.nodes.ordered_list.create(null, item),
    })?.id,
    "block.task_list_item",
  );
  assert.equal(
    resolveContentObject(s.nodes.heading.create({ toggle: true }))?.id,
    "block.toggle_heading",
  );
  const image = s.nodes.image.create({ src: "asset.png" });
  assert.equal(
    resolveContentObject(image, {
      parent: s.nodes.paragraph.create(null, image),
    })?.id,
    "block.image_block",
  );
  assert.equal(
    resolveContentObject(image, {
      parent: s.nodes.paragraph.create(null, [s.text("text"), image]),
    })?.id,
    "inline.image",
  );
  assert.equal(
    resolveContentObject(s.nodes.media_block.create({ type: "pdf" }))?.id,
    "block.pdf",
  );
  const page = s.nodes.child_page.create({ target: "id" });
  assert.equal(resolveContentObject(page)?.id, "block.link_to_page");
  assert.equal(
    resolveContentObject(page, { pageRole: "child" })?.id,
    "block.child_page",
  );
  assert.equal(
    resolveMarkObject(s.marks.color.create({ color: "yellow_bg" }))?.id,
    "inline.background_color",
  );
});

test("callout consolidation retains encoding, custom types, attributes, nested edits and undo", () => {
  for (const [variant, source, form] of [
    [
      "obsidian",
      "> [!custom-kind]- My title\r\n> A **note**\r\n>\r\n> - Nested\r\n\r\nTail",
      "alert",
    ],
    [
      "notion-markdown",
      '<callout icon="🌱" color="green_bg" future="keep">\r\n\tA **note**\r\n\t- Nested\r\n</callout>\r\n\r\nTail',
      "notion",
    ],
  ] as const) {
    const c = config(variant);
    const doc = parseNative(source, c);
    assert.equal(doc.firstChild?.type.name, "callout");
    assert.equal(doc.firstChild?.attrs.syntaxForm, form);
    assert.equal(serializeNative(doc, c), source);
    let state = EditorState.create({ doc, plugins: [history()] });
    let position = 0;
    doc.descendants((node, pos) => {
      if (node.isText && node.text === "Nested") position = pos;
    });
    state = state.apply(state.tr.insertText(" edited", position + 6));
    const written = serializeNative(state.doc, c);
    const next = parseNative(written, c).firstChild!;
    assert.equal(next.type.name, "callout");
    assert.equal(next.attrs.syntaxForm, form);
    assert.match(next.textContent, /Nested edited/);
    if (form === "alert") {
      assert.equal(next.attrs.kind, "custom-kind");
      assert.equal(next.attrs.title, "My title");
      assert.equal(next.attrs.fold, "-");
      state = state.apply(
        state.tr.setNodeMarkup(0, undefined, {
          ...state.doc.firstChild!.attrs,
          title: "New title",
          fold: "+",
        }),
      );
      assert.match(
        serializeNative(state.doc, c),
        /\[!custom-kind\]\+ New title/,
      );
    } else {
      assert.equal(next.attrs.icon, "🌱");
      assert.equal(next.attrs.color, "green_bg");
      assert.equal(next.attrs.nfmAttrs.future, "keep");
    }
    assert(
      undo(state, (tr) => {
        state = state.apply(tr);
      }),
    );
    if (form === "alert")
      assert(
        undo(state, (tr) => {
          state = state.apply(tr);
        }),
      );
    assert.equal(serializeNative(state.doc, c), source);
  }
});

test("TOC encodings share range semantics and HTML export without losing original spelling", () => {
  for (const [variant, spelling, form, levels] of [
    ["typora", "[TOC]", "directive", [1, 6]],
    ["markdown_mmd", "{{TOC:2-3}}", "mmd", [2, 3]],
    ["notion-markdown", '<table_of_contents future="keep"/>', "notion", [1, 6]],
  ] as const) {
    const c = config(variant);
    const raw =
      spelling +
      "\r\n\r\n# One\r\n\r\n## Two\r\n\r\n### Three\r\n\r\n#### Four";
    const doc = parseNative(raw, c),
      toc = doc.firstChild!;
    assert.equal(toc.type.name, "table_of_contents");
    assert.equal(toc.attrs.syntaxForm, form);
    assert.deepEqual([toc.attrs.minLevel, toc.attrs.maxLevel], levels);
    assert.equal(serializeNative(doc, c), raw);
    const html = htmlDocument(
      "TOC",
      raw,
      [],
      variant === "notion-markdown" ? "notion-markdown" : "markdown",
      c,
    );
    const nav = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/)![1];
    assert.match(nav, />Two<\/a>/);
    if (form === "mmd") {
      assert.doesNotMatch(nav, />One<\/a>/);
      assert.doesNotMatch(nav, />Four<\/a>/);
    }
    if (form === "mmd") {
      const state = EditorState.create({ doc });
      const changed = state.tr.setNodeMarkup(0, undefined, {
        ...toc.attrs,
        minLevel: 3,
        maxLevel: 4,
      }).doc;
      const restored = parseNative(serializeNative(changed, c), c).firstChild!;
      assert.deepEqual(
        [restored.attrs.minLevel, restored.attrs.maxLevel],
        [3, 4],
      );
    }
  }
});

test("merged nodes use encoding-specific feature gates and preserve neighboring unknown source", () => {
  const c = config("typora", { notion_callouts: true, notion_toc: true, alerts: true });
  const alert = parseNative("> [!NOTE]\n> text", c).firstChild!;
  const xml = parseNative("<callout>\ntext\n</callout>", c).firstChild!;
  const toc = parseNative("[toc]", c).firstChild!;
  assert(
    nativeBlockSupported(alert, config("typora", { notion_callouts: false, alerts: true })),
  );
  assert(!nativeBlockSupported(alert, config("typora", { alerts: false })));
  assert(
    nativeBlockSupported(
      xml,
      config("typora", { notion_callouts: true, alerts: false }),
    ),
  );
  assert(
    !nativeBlockSupported(xml, config("typora", { notion_callouts: false })),
  );
  assert(nativeBlockSupported(toc, config("typora", { notion_toc: false })));
  assert(
    !nativeBlockSupported(toc, config("typora", { toc_directives: false })),
  );
  const raw =
    '```text\r\n> [!NOTE]\r\n[toc]\r\n```\r\n\r\n<callout future="keep">\r\nunclosed';
  const doc = parseNative(raw, c);
  assert.equal(doc.firstChild!.type.name, "code_block");
  const state = EditorState.create({ doc });
  const changed = state.tr.insert(
    doc.content.size,
    s.nodes.paragraph.create(null, s.text("Neighbor")),
  ).doc;
  assert(serializeNative(changed, c).includes(raw));
});
