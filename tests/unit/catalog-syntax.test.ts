import test from "node:test";
import assert from "node:assert/strict";
import workbook from "../../docs/data/workbook-syntax.json";
import { workbookSyntax } from "../../src/catalog/catalog-syntax";
import { pandocSyntax } from "../../src/catalog/catalog-pandoc-syntax";
import { syntaxGuides, syntaxForExtension, syntaxForObject, syntaxForVariant } from "../../src/catalog/catalog-syntax-index";
import { catalogExtensions, catalogObjects, objectsForExtension } from "../../src/catalog/catalog-relations";

test("every source row and Pandoc manual identifier has an addressable syntax description", () => {
  assert.equal(workbookSyntax.length, 154);
  assert.equal(new Set(syntaxGuides.map(s => s.id)).size, syntaxGuides.length);
  for (const [sheet, records] of Object.entries(workbook.sheets)) {
    for (const cells of records) {
      const row = Number(Object.keys(cells)[0].replace(/\D/g, ""));
      if (sheet === "markdown" && row === 1) continue;
      assert(workbookSyntax.some(s => s.id === `workbook-${sheet}-${row}`));
    }
  }
  assert.deepEqual(pandocSyntax.map(s => s.extensions[0]).sort(), catalogExtensions.filter(e => e.category === "pandoc").map(e => e.id).sort());
  for (const s of syntaxGuides) {
    for (const id of s.objects) assert(catalogObjects.some(o => o.id === id), `${s.id}: ${id}`);
    for (const id of s.extensions) assert(catalogExtensions.some(e => e.id === id), `${s.id}: ${id}`);
    for (const ref of s.references) assert.equal(new URL(ref.url).protocol, "https:");
    assert(s.note && s.locator);
  }
});

test("reference mappings separate wrong workbook associations from executable adapters", () => {
  const toggle = syntaxGuides.find(s => s.id === "workbook-extended-78")!;
  assert.deepEqual(toggle.variants, ["notion-markdown"]);
  assert(toggle.correction?.includes("PHP Extra"));
  assert(!syntaxForVariant("markdown_phpextra").includes(toggle));
  for (let row = 63; row <= 70; row++) {
    const github = syntaxGuides.find(s => s.id === `workbook-extended-${row}`)!;
    assert.deepEqual(github.extensions, []);
    assert(github.limitation?.includes("未实现"));
  }
  assert(syntaxForExtension("tex_math_double_backslash").some(s => s.objects.includes("block.math_block")));
  assert(objectsForExtension("tex_math_double_backslash").some(r => r.objectId === "inline.inline_math"));
  assert(syntaxForObject("block.unsupported").some(s => s.id === "workbook-extended-86"));
  assert.equal(pandocSyntax.filter(s => !s.source).length, 12);
  assert(syntaxForExtension("empty_paragraphs").every(s => !s.source));
});

test("original mistaken citation samples survive alongside corrections", () => {
  for (const row of [36, 37]) {
    const s = workbookSyntax.find(s => s.id === `workbook-extended-${row}`)!;
    assert(s.source.includes("[#Doe:2006]"));
    assert(s.source.includes("[#Doe2006]:"));
    assert(s.correction?.includes("不一致"));
  }
});
