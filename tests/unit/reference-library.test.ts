import test from "node:test";
import assert from "node:assert/strict";
import { parseNative } from "../../src/markdown-engine/codec";
import { referenceOccurrences } from "../../src/features/references/reference-occurrences";
import { internalLibrary } from "../../src/features/references/internal-library";
import { pageExternalReferences } from "../../src/features/references/external-source";
import type { Page } from "../../src/shared/types";
import { projectFootnotes } from "../../src/editor/footnotes";

const syntax = { version: 1, variant: "notdown", notionVersion: "v2", extensions: {} } as const;
const remote = "ea111111-1111-4111-8111-111111111111";
const page = (id: string, title: string, body: string, rest: Partial<Page> = {}) => ({ id, title, body, syntax, properties: {}, ...rest }) as Page;

test("ordinary URLs never become unknown entities; semantic references keep every occurrence", () => {
  const body = `[Web](https://example.test/missing) [Notion URL](https://www.notion.so/${remote}) <https://www.notion.so/${remote}>\n\n<mention url="https://www.notion.so/${remote}">First</mention>\n\n<mention url="https://www.notion.so/${remote}">Second</mention>`;
  const found = pageExternalReferences(page("source", "Source", body));
  assert.deepEqual(found.observations.map(ref => [ref.id, ref.location, ref.occurrence]), [[remote, "Body", 0], [remote, "Body", 1]]);
  assert.equal(internalLibrary([page("source", "Source", body)]).entries.length, 0);
});

test("local link status checks pages, locations, trash and duplicates without scanning code or assets", () => {
  const source = page("source", "Source", `[[Missing]] [[destination]] [[destination#Details]] [[destination#Absent]] [[trashed]] [[Duplicate]]\n\n[Styled **missing** link](Missing.md)\n\n[Asset](/assets/missing.pdf) [Web](https://example.test/missing)\n\n\`\`\`md\n[[Example]]\n\`\`\``);
  const result = internalLibrary([source, page("destination", "Destination", "## Details\n\nBody"), page("trashed", "Deleted", "", { trashed: true }), page("d1", "Duplicate", ""), page("d2", "Duplicate", "")]);
  assert.deepEqual(result.entries.map(entry => [entry.target, entry.status]), [["Missing", "unresolved"], ["destination", "resolved"], ["destination#Details", "resolved"], ["destination#Absent", "unresolved"], ["trashed", "unresolved"], ["Duplicate", "unresolved"], ["Missing.md", "unresolved"]]);
  const refs = referenceOccurrences(parseNative(source.body, syntax));
  assert.equal(refs.filter(ref => ref.internal?.raw === "Missing.md").length, 1);
  assert.equal(refs.find(ref => ref.internal?.raw === "Missing.md")?.label, "Styled missing link");
});

test("occurrence IDs follow source order even when footnotes move into their display section", () => {
  const doc = parseNative('Before [body first](Missing.md).\n\n[^b]: [footnote first](Missing.md).\n\nAfter [body second](Missing.md).\n\nSee [^a] and [^b].\n\n[^a]: [footnote second](Missing.md).', syntax);
  const projected = projectFootnotes(doc);
  const source = referenceOccurrences(doc), display = referenceOccurrences(projected);
  assert.equal(source.length, 4);
  assert.deepEqual(display.map(ref => [ref.key, ref.occurrence, ref.label]), source.map(ref => [ref.key, ref.occurrence, ref.label]));
  for (const ref of display) assert.equal(projected.textBetween(ref.from, ref.to), ref.label);
});
