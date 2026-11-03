import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createUILanguageStore } from "../../src/desktop/ui-language";

test("desktop language survives reopening and serializes concurrent preference writes", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-language-"));
  const filename = path.join(directory, "interface-language.json");
  try {
    const store = createUILanguageStore(() => filename);
    assert.equal(await store.get(), null);
    await Promise.all([store.set("en"), store.set("zh-CN")]);
    assert.equal(await createUILanguageStore(() => filename).get(), "zh-CN");
    assert.throws(() => store.set("invalid"), /Invalid interface language/);
    assert.equal(await store.get(), "zh-CN");
    await fs.writeFile(filename, "broken", "utf8");
    assert.equal(await store.get(), null);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
