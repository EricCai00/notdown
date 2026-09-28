import assert from "node:assert/strict";
import test from "node:test";
import {
  catalogExtensions,
  catalogObjects,
  catalogExtension,
  objectExtensionRelations,
  extensionsForObject,
  objectsForExtension,
  objectsForVariant,
  variantsForObject,
  variantReferences,
  workbookStateLabel,
  extensionNames,
} from "../../src/catalog/catalog-relations";
import { dialects, extensions, enabled } from "../../src/markdown-engine/config";

test("extension sources cover the workbook and current registry without treating reference entries as implemented", () => {
  assert.equal(catalogExtensions.length, 126);
  assert.equal(new Set(catalogExtensions.map((e) => e.id)).size, 126);
  for (const [category, count] of [
    ["pandoc", 89],
    ["product", 16],
    ["notion", 21],
  ] as const)
    assert.equal(
      catalogExtensions.filter((e) => e.category === category).length,
      count,
    );
  for (const [status, count] of [
    ["registered", 114],
    ["pending", 0],
    ["out-of-scope", 12],
  ] as const)
    assert.equal(
      catalogExtensions.filter((e) => e.status === status).length,
      count,
    );
  for (const e of extensions) {
    assert.equal(catalogExtension(e.id)?.status, "registered", e.id);
    assert.ok(
      objectsForExtension(e.id).length,
      `Missing object relation: ${e.id}`,
    );
  }
  for (const e of catalogExtensions) {
    for (const d of dialects) {
      assert.ok(e.workbookStates[d.id]);
      assert.match(workbookStateLabel(e.workbookStates[d.id]), /^[A-Z]/);
    }
    assert.ok(e.references.length || e.id.startsWith("local_"), e.id);
    for (const r of e.references)
      assert.ok(r.url === "notion://docs/enhanced-markdown-spec" || new URL(r.url).protocol === "https:");
  }
  assert.equal(
    enabled(
      { version: 1, variant: "markdown", extensions: { grid_tables: true } },
      "grid_tables",
    ),
    true,
  );
});

test("object, variant and extension links use symmetric relations with explicit planned boundaries", () => {
  for (const relation of objectExtensionRelations) {
    assert.ok(catalogObjects.some((o) => o.id === relation.objectId));
    assert.ok(catalogExtension(relation.extensionId));
    assert.ok(extensionsForObject(relation.objectId).includes(relation));
    assert.ok(objectsForExtension(relation.extensionId).includes(relation));
  }
  for (const object of catalogObjects) {
    for (const adapter of object.adapters)
      for (const flag of adapter.extensions)
        assert.ok(
          extensionsForObject(object.id).some(
            (r) => r.extensionId === flag && r.role === "encoding",
          ),
        );
    for (const variant of variantsForObject(object.id)) {
      const reverse = objectsForVariant(variant.id).find(
        (r) => r.object.id === object.id,
      )!;
      assert.equal(reverse.status, variant.status);
      assert.deepEqual(reverse.editing, variant.editing);
    }
  }
  assert.deepEqual(objectsForExtension("blank_before_header"), [
    {
      objectId: "block.heading",
      extensionId: "blank_before_header",
      role: "modifier",
    },
  ]);
  assert.equal(objectsForExtension("grid_tables")[0].role, "encoding");
  assert.ok(
    variantsForObject("block.tabs").every((v) => v.status === (["notdown", "notion-markdown"].includes(v.id) ? "default" : "unavailable")),
  );
  assert.equal(
    variantsForObject("block.callout").find((v) => v.id === "notion-markdown")
      ?.status,
    "default",
  );
  for (const d of dialects) assert.ok(variantReferences[d.id].length);
});

test("Notion encoding names retain old keys and expose mixed scopes", () => {
  assert.equal(Object.keys(extensionNames).length, 13);
  assert.equal(
    catalogExtension("notion_callouts")?.label,
    "Notion callout tags",
  );
  assert.match(catalogExtension("notion_nesting")!.label, /Notion \/ Notdown/);
  assert.match(catalogExtension("notion_mentions")!.label, /citations/);
  assert.equal(catalogExtension("notion_colors")!.label, "Notion colors");
  assert.equal(catalogExtension("notion_underline")!.label, "Notion underline");
  for (const id of Object.keys(extensionNames))
    assert.ok(extensions.some((e) => e.id === id));
});
