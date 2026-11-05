import test from "node:test";
import assert from "node:assert/strict";
import { cardPreviewDocument, firstCardBlock } from "../../src/features/pages/page-card-preview-model";
import { editorKind } from "../../src/document/node-identity";
import { defaultSyntax } from "../../src/markdown-engine/config";

test("card preview excludes complete YAML and Pandoc metadata but keeps the first body block", () => {
  for (const metadata of ['---\r\ntitle: Example\r\ncover: assets/cover.png\r\n---\r\n', '% Example\n% Author\n% 2026\n\n']) {
    const page = { body: metadata + '# First **heading**\n\nSecond block\n\n![Later](assets/later.png)' };
    const original = page.body;
    const first = firstCardBlock(cardPreviewDocument(page))!;
    assert.equal(editorKind(first), "heading");
    assert.equal(first.textContent, "First heading");
    assert.equal(page.body, original);
  }
});

test("card parsing keeps fenced fake images as code and actual image nodes separate", () => {
  const doc = cardPreviewDocument({ body: '```md\n![Fake](assets/fake.png)\n```\n\n![Real](assets/real.png)' });
  assert.equal(editorKind(firstCardBlock(doc)!), "code_block");
  const images: string[] = [];
  doc.descendants(node => { if (["image", "image_block"].includes(editorKind(node))) images.push(node.attrs.src); });
  assert.deepEqual(images, ["assets/real.png"]);
});

test("empty pages have empty previews and Notion first blocks follow the configured dialect", () => {
  assert.equal(firstCardBlock(cardPreviewDocument({ body: "\n\n" })), undefined);
  const syntax = defaultSyntax("notion-markdown");
  const first = firstCardBlock(cardPreviewDocument({ body: '<callout icon="💡">\nFirst note\n</callout>\n\nLater', syntax }))!;
  assert.equal(editorKind(first), "callout");
  assert.match(first.textContent, /First note/);
});
