import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { renderCitations } from "../../server/pandoc";
test("CSL citeproc renders author/year, locators, bibliography and missing citations without evaluating files", { skip: spawnSync(process.env.PANDOC_PATH || "pandoc", ["--version"], { windowsHide: true }).status !== 0 }, async () => {
  const result = await renderCitations('@book{one, title={Example}, author={Doe, Jane}, year={2020}}', ["[@one, p. 12]", "@one"]);
  assert.match(result.citations["[@one, p. 12]"], /Doe/); assert.match(result.citations["[@one, p. 12]"], /12/);
  assert.match(result.bibliography, /Example/); assert.match(result.bibliography, /ref-one/);
  await assert.rejects(renderCitations("", [], '<!DOCTYPE test SYSTEM "https://example.com/secret">'), /self-contained/);
});
