import test from "node:test";
import assert from "node:assert/strict";
import { buildMindmap, expandMindmapNode, hiddenMindmapCount, mindmapNodeText, visibleMindmapChildren, type MindmapExpansion } from "../../src/features/pages/mindmap-model";
import { defaultSyntax } from "../../src/markdown-engine/config";
import type { SyntaxConfig } from "../../src/markdown-engine/config";
import { editorKind } from "../../src/document/node-identity";

test("mind map defaults to headings and counts every hidden descendant", () => {
  const root = buildMindmap("Research", "Introduction\n\n# Plan\n\nParagraph\n\n## Trial\n\n- Parent\n  - Child\n\n# Results\n\nSummary");
  const states = new Map<string, MindmapExpansion>();
  const [plan, results] = visibleMindmapChildren(root, states);
  assert.equal(plan.text, "Plan"); assert.equal(results.text, "Results");
  assert.deepEqual(visibleMindmapChildren(plan, states).map(n => n.text), ["Trial"]);
  assert.equal(hiddenMindmapCount(root, states), 5);
  states.set(plan.id, "expanded");
  assert.deepEqual(visibleMindmapChildren(plan, states).map(n => n.text), ["Paragraph", "Trial"]);
  states.set(plan.id, "collapsed");
  assert.equal(visibleMindmapChildren(plan, states).length, 0);
  assert.equal(hiddenMindmapCount(plan, states), 4);
});

test("content-only pages keep top-level content and preserve list nesting", () => {
  const root = buildMindmap("Notes", "A paragraph\n\n- Parent\n  - Child\n    - Grandchild");
  const states = new Map<string, MindmapExpansion>();
  assert.equal(root.hasHeading, false);
  assert.deepEqual(visibleMindmapChildren(root, states).map(n => n.text), ["A paragraph", "Parent"]);
  assert.equal(root.children[1].children[0].children[0].text, "Grandchild");
  assert.equal(hiddenMindmapCount(root, states), 2);
  assert.equal(buildMindmap("Empty", "").descendants, 0);
});

test("previews retain original formatted blocks, scoped container content and list numbering", () => {
  const root = buildMindmap("Preview", "# **Title**\n\nFormatted **bold** and `code`\n\n5. First\n6. Second\n   - Nested\n\n> **Quoted**\n\nOutside quote");
  const heading = root.children[0];
  const [paragraph, first, second, quote, outside] = heading.children;
  assert.equal(heading.block.firstChild?.marks[0].type.name, "strong");
  assert.equal(paragraph.block.child(1).marks[0].type.name, "strong");
  assert.equal(editorKind(second.preview), "ordered_list");
  assert.equal(first.preview.attrs.order, 5);
  assert.equal(second.preview.attrs.order, 6);
  assert.equal(second.preview.childCount, 1);
  assert.equal(second.preview.firstChild, second.block);
  assert.equal(second.children[0].text, "Nested");
  assert.equal(quote.preview.textContent, "Quoted");
  assert.equal(outside.preview.textContent, "Outside quote");
  assert.equal(root.preview, root.block);
});

test("code and tables stay summaries; inline formatting and task state remain readable", () => {
  const syntax = defaultSyntax("markdown");
  syntax.extensions = { ...syntax.extensions, task_lists: true, pipe_tables: true };
  const root = buildMindmap("Rich", "# **Title**\n\nText with [link](https://example.com) and `code`.\n\n- [x] Finished\n\n> Quoted text\n\n```js\n# not a heading\nalert('<img>');\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n![diagram](https://example.com/image.png)", "markdown", syntax);
  const heading = root.children[0];
  assert.equal(heading.text, "Title");
  assert.equal(heading.children[0].text, "Text with link and code.");
  assert.equal(heading.children.find(n => n.kind === "task")?.checked, true);
  const code = heading.children.find(n => n.kind === "code")!;
  assert.equal(code.text, "js"); assert.match(code.detail, /# not a heading/); assert.equal(code.children.length, 0);
  assert.equal(heading.children.find(n => n.kind === "table")?.text, "2 × 2");
  assert.equal(heading.children.find(n => n.kind === "media")?.text, "diagram");
  assert.equal(heading.children.find(n => n.kind === "quote")?.children[0].text, "Quoted text");
  assert.equal(buildMindmap("Image", "![](local.png)").children[0].kind, "media");
});

test("dialect boundaries keep unsupported syntax recoverable and do not invent headings from fences", () => {
  const source = "---\ntitle: Metadata\n---\n\n```unknown\n# inside code\n```\n\n# Visible\n\n<unknown data-extra=\"keep\">source</unknown>";
  const root = buildMindmap("Page", source, "notion-markdown");
  const headings: string[] = [];
  const walk = (node: typeof root) => { if (node.kind === "heading") headings.push(node.text); node.children.forEach(walk); };
  walk(root);
  assert.deepEqual(headings, ["Visible"]);
  assert.match(root.children.find(node => node.kind === "heading")!.children[0].detail, /data-extra="keep"/);
});

test("opening a parent opens nested containers while ordinary list branches remain folded", () => {
  const root = buildMindmap("Notes", "# Topic\n\n> Quoted text\n>\n> > Nested quote\n>\n> - Parent item\n>   - Nested item");
  const states = new Map<string, MindmapExpansion>();
  const heading = root.children[0], quote = heading.children[0];
  assert.equal(quote.container, "Quote");
  assert.equal(visibleMindmapChildren(heading, states).length, 0);
  expandMindmapNode(heading, states);
  const nestedQuote = quote.children.find(node => node.container)!;
  assert.equal(visibleMindmapChildren(quote, states).length, 3);
  assert.equal(visibleMindmapChildren(nestedQuote, states)[0].text, "Nested quote");
  assert.equal(visibleMindmapChildren(quote.children.find(node => node.kind === "list")!, states).length, 0);
  assert.equal(hiddenMindmapCount(heading, states), 1);
  states.set(quote.id, "collapsed"); states.set(heading.id, "collapsed");
  expandMindmapNode(heading, states);
  assert.equal(visibleMindmapChildren(quote, states).length, 3);
});

test("named containers keep their type separate from their authored title", () => {
  const root = buildMindmap("Notes", '# Topic\n\n<callout icon="💡">\nAdvice\n</callout>\n\n<columns>\n<column>\nFirst column\n</column>\n<column>\nSecond column\n</column>\n</columns>', "notion-markdown");
  const states = new Map<string, MindmapExpansion>();
  const heading = root.children[0];
  expandMindmapNode(heading, states);
  assert.equal(heading.children[0].container, "Callout");
  const columns = heading.children.find(node => node.container === "Columns")!;
  assert.equal(visibleMindmapChildren(columns, states).length, 2);
  assert.equal(columns.children[0].container, "Column");
  assert.equal(visibleMindmapChildren(columns.children[0], states)[0].text, "First column");
});

const notionV2: SyntaxConfig = { version: 1, variant: "notdown", notionVersion: "v2", extensions: {} };

test("non-text topics use semantic badges while their original preview remains recoverable", () => {
  const sources = ['<database url="#page/wiki"/>', '<unknown alt="button: configuration unavailable (button)"/>', '<breadcrumb/>', '```mermaid\ngraph TD\nA --> B\n```', '<unknown alt="ai_block: configuration unavailable (ai_block)"/>', '<p />', '$$\nE=mc^2\n$$', '---', '<table_of_contents/>', '<unknown alt="Custom unsupported text"/>'];
  const root = buildMindmap("Blocks", sources.join("\n\n"), "notion-markdown", notionV2);
  assert.deepEqual(root.children.map(node => node.typeLabel), ["Database reference", "Button", "Breadcrumb", "Diagram", "AI block", "Paragraph", "Equation", "Divider", "Table of contents", "Unsupported"]);
  assert.ok(root.children.every(node => node.text === ""));
  root.children.forEach((node, index) => {
    assert.equal(node.block.attrs.source, sources[index]);
    assert.equal(node.preview, node.block);
  });
  assert.equal(mindmapNodeText(root.children[0], [{ id: "wiki", title: "New wiki" }]), "New wiki");
  assert.equal(mindmapNodeText(root.children[0]), "");
  assert.equal(buildMindmap("Empty", "").children.length, 0);
});

test("media badges distinguish semantic types, even for empty captions and File blocks containing PDFs", () => {
  const source = ['<image src="image.png"/>', '<audio src="song.mp3"/>', '<video src="movie.mp4"/>', '<pdf src="paper.pdf"/>', '<file src="paper.pdf">Download paper</file>', '<embed src="page.html"/>', '<web-embed url="https://example.com"/>', '<bookmark source="https://example.com">Example</bookmark>', '<link-preview url="https://example.com" title="Preview"/>'].join("\n\n");
  const nodes = buildMindmap("Media", source, "notion-markdown", notionV2).children;
  assert.deepEqual(nodes.map(node => node.typeLabel), ["Image", "Audio", "Video", "PDF", "File", "HTML embed", "Web embed", "Web bookmark", "Link preview"]);
  assert.ok(nodes.every(node => node.kind === "media"));
  assert.equal(nodes[4].text, "Download paper");
  assert.equal(nodes[7].text, "Example");
  assert.equal(nodes[8].text, "Preview");
  assert.equal(buildMindmap("Image", "![Alt text](image.png)").children[0].typeLabel, "Image");
});

test("authored text that resembles source or an import message is not rewritten", () => {
  const root = buildMindmap("Literal text", 'button: configuration unavailable (button)\n\n`<breadcrumb/>` and `#page/wiki`\n\n```html\n<p />\n```');
  assert.equal(root.children[0].text, "button: configuration unavailable (button)");
  assert.equal(root.children[1].text, "<breadcrumb/> and #page/wiki");
  assert.equal(root.children[2].typeLabel, "Code");
  assert.equal(root.children[2].detail, "<p />");
});

test("sibling toggle headings remain under the ordinary section regardless of heading level", () => {
  const root = buildMindmap("Blocks", '# Heading 1\n\n## Heading 2\n\n### Heading 3\n\n#### Heading 4\n\n<toggle heading="h1">\nToggle heading 1\n\nToggle details\n\n## Explicit child heading\n\nChild body\n</toggle>\n\n<toggle heading="h2">\nToggle heading 2\n</toggle>\n\n<toggle heading="h3">\nToggle heading 3\n</toggle>\n\nFollowing content\n\n# Next section', "notion-markdown", notionV2);
  assert.deepEqual(root.children.map(node => node.text), ["Heading 1", "Next section"]);
  const ordinary = root.children[0];
  const heading4 = ordinary.children[0].children[0].children[0];
  assert.equal(heading4.text, "Heading 4");
  assert.deepEqual(heading4.children.map(node => node.text), ["Toggle heading 1", "Toggle heading 2", "Toggle heading 3", "Following content"]);
  const [toggle, second, third] = heading4.children;
  assert.deepEqual(toggle.children.map(node => node.text), ["Toggle details", "Explicit child heading"]);
  assert.deepEqual(toggle.children[1].children.map(node => node.text), ["Child body"]);
  assert.equal(second.level, 2); assert.equal(third.level, 3);
  assert.equal(third.text, "Toggle heading 3");
  assert.equal(second.children.length, 0);
  assert.equal(third.children.length, 0);
  assert.deepEqual(visibleMindmapChildren(toggle, new Map()).map(node => node.text), ["Explicit child heading"]);
  assert.deepEqual(visibleMindmapChildren(heading4, new Map()).map(node => node.text), ["Toggle heading 1", "Toggle heading 2", "Toggle heading 3"]);
});

test("a toggle H1 does not reset the ordinary section or collect following content", () => {
  const root = buildMindmap("Boundary", '# Chapter\n\n<toggle heading="h2">\nToggle section\n\nOwned paragraph\n</toggle>\n\nOutside paragraph\n\n- Outside list\n\n<quote>\nOutside quote\n</quote>\n\n<toggle heading="h1">\nNew toggle section\n</toggle>\n\n<columns>\n<column>\nOutside column\n</column>\n</columns>\n\n<toggle heading="h3">\nEmpty toggle\n</toggle>\n\nPage content', "notion-markdown", notionV2);
  const chapter = root.children[0];
  assert.deepEqual(chapter.children.map(node => node.text || node.container), ["Toggle section", "Outside paragraph", "Outside list", "Quote", "New toggle section", "Columns", "Empty toggle", "Page content"]);
  assert.deepEqual(chapter.children[0].children.map(node => node.text), ["Owned paragraph"]);
  assert.deepEqual(root.children.map(node => node.text), ["Chapter"]);
  assert.equal(chapter.children[4].children.length, 0);
  assert.equal(chapter.children[6].children.length, 0);
  assert.equal(chapter.children[5].children[0].children[0].text, "Outside column");
});

test("toggle headings nest only when the source actually contains them", () => {
  const root = buildMindmap("Explicit nesting", '<toggle heading="h1">\nParent toggle\n\n<toggle heading="h2">\nNested toggle\n\nNested content\n</toggle>\n\nParent content\n</toggle>\n\n<toggle heading="h3">\nSibling toggle\n</toggle>\n\nPage content', "notion-markdown", notionV2);
  assert.deepEqual(root.children.map(node => node.text), ["Parent toggle", "Sibling toggle", "Page content"]);
  assert.deepEqual(root.children[0].children.map(node => node.text), ["Nested toggle", "Parent content"]);
  assert.equal(root.children[0].children[0].children[0].text, "Nested content");
  assert.equal(root.children[1].children.length, 0);
});

test("ordinary toggle summaries are container titles, including nested and empty toggles", () => {
  const root = buildMindmap("Toggles", '<toggle>\n**Toggle title** with [link](https://example.com)\n\nFirst detail\n\n<toggle>\nNested title\n\nNested detail\n</toggle>\n</toggle>\n\n<toggle>\nTitle only\n</toggle>\n\n<toggle>\n<p />\n</toggle>', "notion-markdown", notionV2);
  const [toggle, titleOnly, empty] = root.children;
  assert.equal(toggle.container, "Toggle");
  assert.equal(toggle.text, "Toggle title with link");
  assert.deepEqual(toggle.children.map(node => node.text), ["First detail", "Nested title"]);
  assert.equal(toggle.children[1].children[0].text, "Nested detail");
  assert.equal(toggle.descendants, 3);
  assert.equal(titleOnly.text, "Title only"); assert.equal(titleOnly.children.length, 0);
  assert.equal(empty.text, ""); assert.equal(empty.children.length, 0);
});
