/** Read-only codec audit; never opens a vault or resolves external resources. */
import { mkdirSync, writeFileSync } from "node:fs";
import { syntaxGuides } from "../src/catalog/catalog-syntax-index";
import { parseNative, serializeNative } from "../src/markdown-engine/codec";
import type { SyntaxConfig } from "../src/markdown-engine/config";

const results = syntaxGuides.filter(s => s.source).flatMap(s => s.variants.flatMap(variant => {
  const configurations: SyntaxConfig[] = [{ version: 1, variant, extensions: {} }];
  if (s.extensions.length) configurations.push({ version: 1, variant, extensions: Object.fromEntries(s.extensions.map(id => [id, id !== "space_in_atx_header"])) });
  return configurations.map((config, i) => {
    try {
      const doc = parseNative(s.source, config);
      doc.check();
      const nodes: string[] = [], marks = new Set<string>();
      doc.descendants(n => { if (!n.isText) nodes.push(n.type.name + (n.attrs.kind ? `:${n.attrs.kind}` : "")); n.marks.forEach(m => marks.add(m.type.name)); });
      return { id: s.id, locator: s.locator, variant, mode: i ? "related-switches" : "default", nodes, marks: [...marks], text: doc.textContent, roundTrip: serializeNative(doc, config) === s.source };
    } catch (error) {
      return { id: s.id, locator: s.locator, variant, mode: i ? "related-switches" : "default", error: String(error) };
    }
  });
}));
mkdirSync("test-results", { recursive: true });
writeFileSync("test-results/catalog-syntax-audit.json", JSON.stringify(results, null, 2) + "\n");
console.log(JSON.stringify({ guides: syntaxGuides.length, configurations: results.length, errors: results.filter(r => 'error' in r), roundTripDifferences: results.filter(r => 'roundTrip' in r && !r.roundTrip) }, null, 2));
